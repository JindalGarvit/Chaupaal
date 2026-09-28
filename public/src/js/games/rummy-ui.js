/**
 * Rummy (Dangal P8) — 13-card Rummy (Points · Pool 101/201 · Deals) and Gin Rummy.
 * Practice vs bots (Easy / Normal / Expert) with a post-hand coach and optional beginner helpers ·
 * Live tables through a party room: the server (server-lib/rummy-engine.js) shuffles, deals and
 * validates every move with the same rules core (rummy-core.js); only your own hand reaches this phone.
 * Default game: 13-card where the phone's locale is India, Gin elsewhere — both are always one tap away.
 */
(function () {
  'use strict';

  const GAME = 'rummy';
  const LABEL = 'Rummy';
  const SETUP_KEY = 'chaupaal_rummy_setup';
  const PREFS_KEY = 'chaupaal_rummy_prefs';
  const Core = () => window.RummyCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('rummy.' + key, fallback) : fallback;
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

  const RANK_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RANK_PLURAL = ['', 'Aces', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings'];
  const LEVELS = ['easy', 'normal', 'expert'];
  function levelLabel(l) {
    return { easy: tr('lvl.easy', 'Easy'), normal: tr('lvl.normal', 'Normal'), expert: tr('lvl.expert', 'Expert') }[l] || l;
  }
  function modeLabel(m) {
    return m === 'gin' ? tr('gin', 'Gin Rummy') : tr('thirteen', '13-card Rummy');
  }
  function formatLabel(s) {
    if (s.mode === 'gin') return tr('ginTo', 'Gin Rummy · to') + ' ' + s.target;
    if (s.format === 'pool') return tr('pool', 'Pool') + ' ' + s.pool;
    if (s.format === 'deals') return tr('deals', 'Deals') + ' · ' + s.deals;
    return tr('points', 'Points Rummy');
  }
  /** India → 13-card by default; everywhere else → Gin. Both are always available. */
  function localeMode() {
    return typeof isIndiaLocale === 'function' && isIndiaLocale() ? '13' : 'gin';
  }
  function loadSetup() {
    const s = Object.assign(
      { mode: localeMode(), format: 'points', pool: 101, deals: 2, bots: 1, level: 'normal', knock: 10, target: 100, scoring: 'simple', bigGin: false },
      readJson(SETUP_KEY, {})
    );
    if (LEVELS.indexOf(s.level) < 0) s.level = 'normal';
    s.bots = Math.max(1, Math.min(5, Number(s.bots) || 1));
    return s;
  }
  function prefs() {
    return Object.assign({ coach: true, helper: false }, readJson(PREFS_KEY, {}));
  }
  function setPref(k, v) {
    writeJson(PREFS_KEY, Object.assign(prefs(), { [k]: v }));
  }

  // ---------------- cards ----------------

  function cardHtml(c, o) {
    const opt = o || {};
    const size = opt.size || 'md';
    if (!c) return `<span class="rm-card rm-card--${size} rm-card--back" aria-hidden="true"></span>`;
    const C = Core();
    const cls = ['rm-card', 'rm-card--' + size];
    let inner;
    let name;
    if (C.isPrinted(c)) {
      cls.push('is-joker');
      inner = '<b>★</b><i>' + esc(tr('jkr', 'JKR')) + '</i>';
      name = tr('joker', 'Joker');
    } else {
      const s = C.suitOf(c);
      if (s === 'H' || s === 'D') cls.push('is-red');
      inner = `<b>${RANK_SHORT[C.rankOf(c)]}</b><i>${C.SUIT_SYMBOLS[s]}</i>`;
      name = C.cardName(c);
      if (opt.wild && C.isJoker(c, opt.wild)) {
        cls.push('is-wild');
        inner += '<em aria-hidden="true">★</em>';
        name += ' · ' + tr('wildJoker', 'wild joker');
      }
    }
    if (opt.sel) cls.push('is-sel');
    if (opt.hint) cls.push('is-hint');
    if (opt.fresh) cls.push('is-fresh');
    if (opt.dim) cls.push('is-dim');
    if (opt.button) {
      return `<button type="button" class="${cls.join(' ')}" data-card="${esc(c)}" aria-pressed="${opt.sel ? 'true' : 'false'}" aria-label="${esc(name)}">${inner}</button>`;
    }
    return `<span class="${cls.join(' ')}" role="img" aria-label="${esc(name)}">${inner}</span>`;
  }
  function miniCards(list, wild) {
    return (list || []).map((c) => cardHtml(c, { size: 'xs', wild })).join('');
  }
  function wildLabel(d) {
    if (!d || !d.wildRank) return '';
    return Core().isPrinted(d.wildCard) ? tr('acesWild', 'Aces (a joker was cut)') : RANK_PLURAL[d.wildRank];
  }

  // ---------------- grouping helpers ----------------

  function suitGroups(hand, wild, gin) {
    const C = Core();
    const jokers = gin ? [] : hand.filter((c) => C.isJoker(c, wild));
    const rest = hand.filter((c) => jokers.indexOf(c) < 0);
    const out = [];
    ['S', 'H', 'C', 'D'].forEach((s) => {
      const g = rest.filter((c) => C.suitOf(c) === s).sort((a, b) => C.rankOf(a) - C.rankOf(b));
      if (g.length) out.push(g);
    });
    if (jokers.length) out.push(jokers);
    return out;
  }
  function bestGroups(hand, wild, gin) {
    const g = Core().arrange(hand, gin ? 0 : wild, !!gin) || [];
    return g.map((x) => x.slice()).filter((x) => x.length);
  }
  /** Keep the player's arrangement; drop cards that left the hand, new cards go to a group at the end. */
  function reconcile(groups, hand) {
    const inHand = new Set(hand);
    const seen = new Set();
    const out = groups.map((g) =>
      g.filter((c) => {
        if (!inHand.has(c) || seen.has(c)) return false;
        seen.add(c);
        return true;
      })
    );
    const fresh = hand.filter((c) => !seen.has(c));
    if (fresh.length) out.push(fresh);
    return out.filter((g) => g.length);
  }

  function reasonText(r) {
    if (r === 'no_pure') return tr('noPure', 'You don’t have a pure sequence (a run with no joker).');
    if (r === 'no_second') return tr('noSecond', 'You need a second sequence as well as the pure one.');
    return tr('badGroup', 'One of your groups isn’t a valid sequence or set.');
  }
  const ERRORS = {
    not_your_turn: 'Not your turn',
    phase: 'Not now — wait for your turn',
    joker_pick: 'Jokers can’t be picked from the open pile',
    same_card: 'You can’t throw back the card you just picked',
    no_card: 'That card isn’t in your hand',
    bad_groups: 'Those groups don’t match your cards',
    no_drop: 'There’s no drop in Deals',
    cant_knock: 'Too much deadwood to knock',
    stock_only: 'Draw from the stock this turn',
    empty: 'That pile is empty',
    no_rejoin: 'Rejoin isn’t open',
  };

  function confirmSheet(title, body, yes, no) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      Kit().openSheet({
        title,
        bodyHtml: `<div class="cl-setup"><p class="cl-note">${esc(body)}</p>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-yes>${esc(yes)}</button>
          <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-no>${esc(no)}</button></div>`,
        onMount(el, close) {
          el.querySelector('[data-yes]').addEventListener('click', () => {
            finish(true);
            close();
          });
          el.querySelector('[data-no]').addEventListener('click', () => {
            finish(false);
            close();
          });
        },
        onClose: () => finish(false),
      });
    });
  }

  // ---------------- the table view (shared by practice and Live) ----------------

  /**
   * vm = publicView (+ Live extras) merged with the viewer's private view:
   * { mode, format, set, seats, dealNo, over, winner, ranking, final, log, d (deal), me, hand, myDrawn,
   *   canDrop, dropCost, mustMeld, canRejoin, gin, live, inBank, chip, pot }
   * @param {HTMLElement} host
   * @param {{ live?: boolean, practice?: boolean, act: (type: string, args?: object) => Promise<any>|any,
   *   onNextDeal?: () => void, onSkip?: () => void, footer?: (vm, el) => void, menu?: () => {label,run}[],
   *   onHud?: (el) => void, coach?: () => object|null, helper?: () => boolean, name?: (vm, i) => string }} o
   */
  function createView(host, o) {
    host.innerHTML = `<div class="rm-wrap">
      <div class="rm-top" data-top></div>
      <div class="rm-table" data-table></div>
      <div class="rm-hand" data-hand></div>
      <div class="rm-bar" data-bar></div>
      <div class="rm-foot" data-foot></div>
    </div>`;
    const topEl = host.querySelector('[data-top]');
    const tableEl = host.querySelector('[data-table]');
    const handEl = host.querySelector('[data-hand]');
    const barEl = host.querySelector('[data-bar]');
    const footEl = host.querySelector('[data-foot]');
    let vm = null;
    let groups = [];
    let groupKey = '';
    let sel = new Set();
    let pending = false;
    let destroyed = false;
    let drag = null;
    let suppressClick = false;
    let lastTurnKey = '';
    const solveCache = {};

    const C = () => Core();
    const d = () => (vm && vm.d) || {};
    const wild = () => (vm && !vm.gin ? d().wildRank : 0);
    const myTurn = () => !!vm && !vm.over && vm.me >= 0 && d().turn === vm.me && ['draw', 'discard', 'upcard'].indexOf(d().phase) >= 0;
    const canDraw = () => myTurn() && (d().phase === 'draw' || d().phase === 'upcard');
    const canThrow = () => myTurn() && d().phase === 'discard';
    const nameOf = (i) => {
      const s = vm.seats[i];
      if (!s) return '';
      if (i === vm.me) return tr('you', 'You');
      return o.name ? o.name(vm, i) : s.name;
    };

    function solveCached(cards, opts) {
      const key = cards.slice().sort().join(',') + '|' + JSON.stringify(opts);
      if (!solveCache[key]) {
        const keys = Object.keys(solveCache);
        if (keys.length > 40) keys.slice(0, 20).forEach((k) => delete solveCache[k]);
        solveCache[key] = C().solve(cards, opts);
      }
      return solveCache[key];
    }

    function syncGroups() {
      const key = [vm.mode, vm.dealNo, vm.me].join(':');
      const hand = vm.hand || [];
      if (key !== groupKey || !groups.length) {
        groupKey = key;
        groups = vm.gin ? bestGroups(hand, 0, true) : suitGroups(hand, wild(), false);
        sel = new Set();
      }
      groups = reconcile(groups, hand);
      sel = new Set([...sel].filter((c) => hand.indexOf(c) >= 0));
    }

    // ---------- top: seats + banner ----------

    function seatStatus(i) {
      const s = vm.seats[i];
      const dd = d();
      if (s.left) return tr('left', 'Left');
      if (s.out) return tr('out', 'Out');
      if (!vm.gin && dd.results && dd.results[i]) {
        const r = dd.results[i];
        if (r.kind === 'first_drop' || r.kind === 'middle_drop') return tr('dropped', 'Dropped') + ' ' + r.points;
        if (r.kind === 'wrong') return tr('wrongShow', 'Wrong show') + ' ' + r.points;
        if (r.kind === 'timeout') return tr('timedOut', 'Timed out');
        if (r.kind === 'win') return dd.phase === 'done' ? tr('winner', 'Winner') : tr('declared', 'Declared');
        if (dd.phase === 'meld' || dd.phase === 'done') return r.points + ' ' + tr('pts', 'pts');
      }
      if (!vm.gin && dd.phase === 'meld' && (dd.pending || []).indexOf(i) >= 0) return tr('grouping', 'Grouping…');
      return '';
    }
    function scoreText(s) {
      if (vm.gin) return s.score + ' / ' + vm.set.target;
      if (vm.format === 'pool') return s.score + ' / ' + vm.set.pool;
      if (vm.format === 'deals') return tr('chipsShort', 'score') + ' ' + s.score;
      return '';
    }

    function bannerText() {
      const dd = d();
      if (vm.over) return '';
      if (dd.phase === 'done') return dealLine();
      if (dd.phase === 'meld') {
        const who = nameOf(dd.declarer);
        return vm.mustMeld ? who + ' ' + tr('declaredGroup', 'declared — group your cards and submit') : who + ' ' + tr('declaredWait', 'declared — waiting for everyone’s groups');
      }
      if (myTurn()) {
        if (dd.phase === 'upcard') return tr('upcardTurn', 'Take the upcard, or pass');
        if (dd.phase === 'draw') return vm.gin && dd.stockOnly ? tr('stockTurn', 'Your turn — draw from the stock') : tr('drawTurn', 'Your turn — draw from the deck or the open pile');
        return vm.gin ? tr('throwGin', 'Throw a card — or knock') : tr('throwTurn', 'Throw a card — or put it on Finish to declare');
      }
      const s = vm.seats[dd.turn];
      return s ? nameOf(dd.turn) + ' ' + tr('isPlaying', 'is playing…') : '';
    }

    function dealLine() {
      const dd = d();
      if (vm.gin) {
        const r = dd.result;
        if (!r) return '';
        if (r.kind === 'draw') return tr('ginDraw', 'Hand drawn — the stock ran out');
        const how = { gin: tr('wentGin', 'went Gin'), biggin: tr('wentBigGin', 'went Big Gin'), knock: tr('knocked', 'knocked'), undercut: tr('wasUndercut', 'was undercut') }[r.kind] || '';
        return nameOf(r.by) + ' ' + how + ' · ' + nameOf(r.winner) + ' +' + r.pts;
      }
      const w = dd.winner;
      return w >= 0 ? nameOf(w) + ' ' + (w === vm.me ? tr('winDealYou', 'win the deal') : tr('winsDeal', 'wins the deal')) : tr('dealOver', 'Deal over');
    }

    function paintTop() {
      const others = vm.seats.map((s, i) => i).filter((i) => i !== vm.me);
      const dd = d();
      const turnSeat = !vm.over && ['draw', 'discard', 'upcard'].indexOf(dd.phase) >= 0 ? dd.turn : -1;
      const counts = dd.counts || [];
      const seatsHtml = others
        .map((i) => {
          const s = vm.seats[i];
          const inactive = s.out || s.left || (!vm.gin && dd.active && !dd.active[i] && dd.phase !== 'done');
          const status = seatStatus(i);
          const botTag = s.bot && !/^Bot\b/.test(s.name) ? ` <span class="cl-tag">${esc(tr('bot', 'Bot'))}</span>` : '';
          const presence = vm.live && !s.bot ? `<span class="pk-dot" data-presence="${esc(s.id)}"></span>` : '';
          const sc = scoreText(s);
          return `<div class="rm-seat${i === turnSeat ? ' is-turn' : ''}${inactive ? ' is-out' : ''}">
            <div class="rm-seat-name">${presence}${esc(nameOf(i))}${botTag}</div>
            <div class="rm-seat-meta">${counts[i] != null && !inactive && dd.phase !== 'done' ? counts[i] + ' ' + esc(tr('cards', 'cards')) : ''}${sc ? (counts[i] != null && !inactive && dd.phase !== 'done' ? ' · ' : '') + esc(sc) : ''}</div>
            ${status ? `<div class="rm-seat-tag">${esc(status)}</div>` : ''}
          </div>`;
        })
        .join('');
      const mine = vm.me >= 0 ? vm.seats[vm.me] : null;
      const myScore = mine && scoreText(mine);
      const tone = myTurn() || vm.mustMeld ? 'you' : vm.over || d().phase === 'done' ? 'end' : '';
      const extra = vm.live && vm.inBank && dd.turn === vm.me && myTurn() ? ' · ' + tr('extraTime', 'extra time') : '';
      const last = (vm.log || [])[vm.log.length - 1];
      topEl.innerHTML = `<div class="rm-seats">${seatsHtml}</div>
        <div class="cl-banner rm-banner" role="status" aria-live="polite" data-tone="${tone}">${esc(bannerText() + extra)}${vm.live && !vm.over ? ' <span class="cl-timer pk-timer" data-timer></span>' : ''}</div>
        <div class="rm-sub">${myScore ? `<span class="rm-chip">${esc(tr('yourScore', 'You'))} ${esc(myScore)}</span>` : ''}${
          vm.live && vm.chip ? `<span class="rm-chip rm-chip--gold">${esc(chipLine(vm))}</span>` : ''
        }${last && last.msg && !myTurn() ? `<span class="rm-log">${esc(last.msg)}</span>` : ''}</div>`;
      if (o.onHud) o.onHud(topEl);
    }

    // ---------- table: piles, wild, finish ----------

    function usefulOpen() {
      if (!o.helper || !o.helper() || !canDraw()) return false;
      const dd = d();
      const top = dd.open[dd.open.length - 1];
      if (!top || (vm.gin && dd.stockOnly)) return false;
      if (!vm.gin && C().isJoker(top, wild()) && !dd.firstOpen) return false;
      const hand = vm.hand;
      const cur = solveCached(hand, { wild: wild(), gin: vm.gin }).points;
      const alt = solveCached(hand.concat([top]), { wild: wild(), gin: vm.gin, discard: true, keep: top }).points;
      return cur - alt >= (vm.gin ? 4 : 6);
    }

    function paintTable() {
      const dd = d();
      const top = dd.open[dd.open.length - 1];
      const openOk = canDraw() && top && !(vm.gin && dd.stockOnly) && (vm.gin || !C().isJoker(top, wild()) || dd.firstOpen);
      const closedOk = canDraw() && dd.phase !== 'upcard';
      const useful = usefulOpen();
      const throwing = canThrow();
      const prev = dd.open.slice(-5, -1).reverse();
      tableEl.innerHTML = `<div class="rm-piles">
        <button type="button" class="rm-pile" data-draw="closed" ${closedOk ? '' : 'disabled'} aria-label="${esc(tr('drawDeck', 'Draw from the deck'))}">
          ${cardHtml(null, { size: 'md' })}<span class="rm-pile-label">${esc(vm.gin ? tr('stock', 'Stock') : tr('deck', 'Deck'))} · ${Number(dd.closed) || 0}</span></button>
        <button type="button" class="rm-pile${useful ? ' is-useful' : ''}${throwing ? ' is-target' : ''}" data-draw="open" data-zone="discard" ${openOk || throwing ? '' : 'disabled'} aria-label="${esc(throwing ? tr('discardHere', 'Throw the selected card') : tr('takeOpen', 'Take the open card'))}">
          ${top ? cardHtml(top, { size: 'md', wild: wild() }) : '<span class="rm-card rm-card--md rm-card--slot"></span>'}
          <span class="rm-pile-label">${esc(useful ? tr('useful', 'Useful!') : throwing ? tr('throwHere', 'Throw here') : tr('open', 'Open'))}</span></button>
        ${
          vm.gin
            ? ''
            : `<div class="rm-wild" aria-label="${esc(tr('wildIs', 'Wild joker') + ': ' + wildLabel(dd))}">${dd.wildCard ? cardHtml(dd.wildCard, { size: 'sm' }) : ''}<span class="rm-pile-label">${esc(tr('wild', 'Wild'))}: ${esc(wildLabel(dd))}</span></div>`
        }
        ${
          !vm.gin && throwing
            ? `<div class="rm-finish" data-zone="finish" role="button" tabindex="0" aria-label="${esc(tr('finishAria', 'Finish slot: declare with the selected card'))}"><b>${esc(tr('finish', 'Finish'))}</b><small>${esc(tr('finishSub', 'drop a card to declare'))}</small></div>`
            : ''
        }
      </div>
      <button type="button" class="rm-discards" data-history aria-label="${esc(tr('historyAria', 'Discard history'))}">
        <span class="rm-pile-label">${esc(tr('lastDiscards', 'Earlier discards'))}</span>
        <span class="rm-discard-row">${prev.length ? miniCards(prev, wild()) : `<span class="rm-none">${esc(tr('none', 'none yet'))}</span>`}</span>
        <span class="pk-chev" aria-hidden="true">›</span>
      </button>`;
      tableEl.querySelectorAll('[data-draw]').forEach((btn) =>
        btn.addEventListener('click', () => {
          if (btn.dataset.zone === 'discard' && canThrow()) {
            if (sel.size === 1) return doDiscard([...sel][0]);
            return toast(tr('pickOne', 'Select one card to throw'));
          }
          if (canDraw()) send('draw', { from: btn.dataset.draw });
        })
      );
      const fin = tableEl.querySelector('[data-zone="finish"]');
      if (fin) {
        const go = () => (sel.size === 1 ? doDeclare([...sel][0]) : toast(tr('pickFinish', 'Select the card to put on Finish')));
        fin.addEventListener('click', go);
        fin.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            go();
          }
        });
      }
      tableEl.querySelector('[data-history]').addEventListener('click', openHistory);
    }

    function openHistory() {
      const dd = d();
      const rows = vm.seats
        .map((s, i) => {
          const thrown = (dd.discards || [])[i] || [];
          const picked = (dd.picks || [])[i] || [];
          if (!thrown.length && !picked.length) return '';
          return `<div class="rm-hist-row"><b>${esc(nameOf(i))}</b>
            ${thrown.length ? `<div class="rm-hist-line"><span>${esc(tr('threw', 'Threw'))}</span>${miniCards(thrown, wild())}</div>` : ''}
            ${picked.length ? `<div class="rm-hist-line"><span>${esc(tr('picked', 'Picked up'))}</span>${miniCards(picked, wild())}</div>` : ''}</div>`;
        })
        .join('');
      Kit().openSheet({
        title: tr('history', 'Discards this deal'),
        bodyHtml: `<div class="rm-hist">
          <div class="cl-sub">${esc(tr('openPile', 'Open pile, newest first'))}</div>
          <div class="rm-hist-line">${miniCards(dd.open.slice().reverse(), wild())}</div>
          ${rows || `<p class="cl-note">${esc(tr('noHistory', 'Nothing thrown yet.'))}</p>`}
          <p class="cl-note">${esc(tr('historyNote', 'What others pick up tells you what they collect — avoid feeding them.'))}</p></div>`,
      });
    }

    // ---------- hand ----------

    function counterHtml() {
      if (!vm.hand.length) return '';
      if (vm.gin) {
        const dw = solveCached(vm.hand, { gin: true, discard: vm.hand.length === 11, keep: d().drawnFrom === 'open' ? vm.myDrawn : null }).points;
        return `<div class="rm-count"><span>${esc(tr('deadwood', 'Deadwood'))} <b>${dw}</b></span>${dw <= vm.set.knock && canThrow() ? `<span class="rm-ok">${esc(dw === 0 ? tr('ginReady', 'Gin is on!') : tr('canKnock', 'You can knock'))}</span>` : ''}</div>`;
      }
      const ev = C().evaluate(groups, wild());
      let ready = '';
      if (canThrow() && sel.size === 1) {
        const c = [...sel][0];
        const gs = groups.map((g) => g.filter((x) => x !== c)).filter((g) => g.length);
        if (C().checkDeclaration(gs, vm.hand.filter((x) => x !== c), wild()).valid) ready = tr('readyShow', 'Valid show — put it on Finish');
      } else if (vm.hand.length === 13 && ev.valid) ready = tr('validHand', 'Valid hand ✓');
      return `<div class="rm-count"><span>${esc(tr('yourCount', 'Your count'))} <b>${ev.points}</b></span>${ready ? `<span class="rm-ok">${esc(ready)}</span>` : ''}</div>`;
    }

    function suggestedDiscard() {
      if (!o.helper || !o.helper() || !canThrow()) return null;
      const keep = d().drawnFrom === 'open' ? vm.myDrawn : null;
      return solveCached(vm.hand, { wild: wild(), gin: vm.gin, discard: true, keep }).discard || null;
    }

    function paintHand() {
      if (vm.me < 0) {
        handEl.innerHTML = `<p class="rm-watch">${esc(tr('watching', 'You’re watching this table'))}</p>`;
        return;
      }
      if (!vm.hand.length) {
        handEl.innerHTML = vm.over || d().phase === 'done' ? '' : `<p class="rm-watch">${esc(tr('sittingOut', 'You’re out of this deal'))}</p>`;
        return;
      }
      const hint = suggestedDiscard();
      const w = wild();
      const html = groups
        .map((g, gi) => {
          const kind = g.length >= 3 ? C().classify(g, w, vm.gin) : 'small';
          const label = g.length >= 3 ? C().groupLabel(kind, vm.gin) : '';
          return `<div class="rm-group is-${kind}" data-gdrop="${gi}">
            <div class="rm-group-cards">${g.map((c) => cardHtml(c, { button: true, wild: w, sel: sel.has(c), hint: c === hint, fresh: c === vm.myDrawn })).join('')}</div>
            <div class="rm-group-label">${esc(label)}</div></div>`;
        })
        .join('');
      handEl.innerHTML = `<div class="rm-groups" data-groups>${html}
          <div class="rm-group rm-group--new" data-newgroup ${sel.size || drag ? '' : 'hidden'}><span>${esc(tr('newGroup', '+ New group'))}</span></div></div>
        ${counterHtml()}`;
      wireHand();
    }

    function toggle(card) {
      if (sel.has(card)) sel.delete(card);
      else sel.add(card);
      paintHand();
      paintBar();
    }

    function wireHand() {
      handEl.querySelectorAll('[data-card]').forEach((el) => {
        el.addEventListener('click', () => {
          if (suppressClick) {
            suppressClick = false;
            return;
          }
          toggle(el.dataset.card);
        });
        el.addEventListener('pointerdown', onDown);
      });
      handEl.querySelector('[data-newgroup]')?.addEventListener('click', () => groupSelected());
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      const el = e.currentTarget;
      drag = { id: e.pointerId, card: el.dataset.card, el, x: e.clientX, y: e.clientY, on: false, ghost: null, over: null };
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {}
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onCancel);
    }
    function moving() {
      if (!drag) return [];
      return sel.has(drag.card) && sel.size > 1 ? [...sel] : [drag.card];
    }
    function startDrag() {
      drag.on = true;
      const cards = moving();
      const g = document.createElement('div');
      g.className = 'rm-ghost';
      g.innerHTML = cards.map((c) => cardHtml(c, { size: 'md', wild: wild() })).join('');
      document.body.appendChild(g);
      drag.ghost = g;
      handEl.querySelectorAll('[data-card]').forEach((el) => {
        if (cards.indexOf(el.dataset.card) >= 0) el.classList.add('is-lifted');
      });
      const ng = handEl.querySelector('[data-newgroup]');
      if (ng) ng.hidden = false;
    }
    function targetAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('[data-gdrop],[data-newgroup],[data-zone]') : null;
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.on && dx * dx + dy * dy > 64) startDrag();
      if (!drag.on) return;
      e.preventDefault();
      drag.ghost.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 34}px)`;
      const tgt = targetAt(e.clientX, e.clientY);
      if (tgt !== drag.over) {
        if (drag.over) drag.over.classList.remove('is-over');
        drag.over = tgt;
        if (tgt) tgt.classList.add('is-over');
      }
    }
    function endDrag(el) {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      if (drag && drag.ghost) drag.ghost.remove();
      if (drag && drag.over) drag.over.classList.remove('is-over');
    }
    function onCancel(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const on = drag.on;
      endDrag(drag.el);
      drag = null;
      if (on) paintHand();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dr = drag;
      endDrag(dr.el);
      if (!dr.on) {
        drag = null;
        return;
      }
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      const cards = moving();
      drag = null;
      const tgt = targetAt(e.clientX, e.clientY);
      if (tgt && tgt.dataset.zone === 'discard' && canThrow() && cards.length === 1) return doDiscard(cards[0]);
      if (tgt && tgt.dataset.zone === 'finish' && canThrow() && cards.length === 1) return doDeclare(cards[0]);
      if (tgt && tgt.hasAttribute('data-newgroup')) {
        moveCards(cards, -1, 0);
        return;
      }
      if (tgt && tgt.dataset.gdrop != null) {
        const gi = Number(tgt.dataset.gdrop);
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const before = under && under.closest('[data-card]');
        const beforeCard = before && cards.indexOf(before.dataset.card) < 0 ? before.dataset.card : null;
        moveCards(cards, gi, beforeCard);
        return;
      }
      paintHand();
    }
    /** gi = -1 → a new group at the end. */
    function moveCards(cards, gi, beforeCard) {
      const targetRef = gi >= 0 ? groups[gi] : null;
      groups = groups.map((g) => g.filter((c) => cards.indexOf(c) < 0));
      if (targetRef) {
        const idx = groups.findIndex((g, i) => i === gi);
        const g = groups[idx];
        const at = beforeCard ? g.indexOf(beforeCard) : -1;
        if (at >= 0) g.splice(at, 0, ...cards);
        else g.push(...cards);
      } else groups.push(cards.slice());
      groups = groups.filter((g) => g.length);
      sel = new Set();
      fx('place');
      paintHand();
      paintBar();
    }
    function groupSelected() {
      if (sel.size < 1) return;
      moveCards([...sel], -1, 0);
    }

    // ---------- actions ----------

    async function send(type, args) {
      if (pending) return null;
      pending = true;
      paintBar();
      let out = null;
      try {
        out = await o.act(type, args || {});
      } finally {
        pending = false;
      }
      if (out && !out.error) sel = new Set();
      if (!destroyed && vm) {
        paintHand();
        paintBar();
      }
      return out;
    }
    function doDiscard(card) {
      if (!canThrow()) return;
      if (d().drawnFrom === 'open' && card === vm.myDrawn) return toast(ERRORS.same_card);
      send('discard', { card });
    }
    async function doDeclare(card) {
      if (!canThrow() || vm.gin) return;
      const rest = vm.hand.filter((c) => c !== card);
      const gs = groups.map((g) => g.filter((x) => x !== card)).filter((g) => g.length);
      const check = C().checkDeclaration(gs, rest, wild());
      if (!check.valid) {
        const go = await confirmSheet(tr('wrongQ', 'Declare anyway?'), reasonText(check.reason) + ' ' + tr('wrongCost', 'A wrong show costs 80 points.'), tr('declareAnyway', 'Declare anyway'), tr('keepPlaying', 'Keep playing'));
        if (!go) return;
      }
      send('declare', { card, groups: gs });
    }
    function doKnock(card) {
      if (!canThrow() || !vm.gin) return;
      if (d().drawnFrom === 'open' && card === vm.myDrawn) return toast(ERRORS.same_card);
      const rest = vm.hand.filter((c) => c !== card);
      const pts = solveCached(rest, { gin: true }).points;
      if (pts > vm.set.knock) return toast(tr('tooMuch', 'Too much deadwood to knock') + ' (' + pts + ')');
      send('knock', { card });
    }
    async function doDrop() {
      const go = await confirmSheet(tr('dropQ', 'Drop this deal?'), tr('dropBody', 'You’ll score') + ' ' + vm.dropCost + ' ' + tr('dropBody2', 'points and sit out until the next deal.'), tr('drop', 'Drop') + ' (' + vm.dropCost + ')', tr('keepPlaying', 'Keep playing'));
      if (go) send('drop');
    }

    function paintBar() {
      if (!vm) return;
      const dd = d();
      const btn = (attr, label, cls, disabled) => `<button type="button" class="pkr-act${cls ? ' pkr-act--' + cls : ''}" ${attr} ${disabled || pending ? 'disabled' : ''}>${esc(label)}</button>`;
      const primary = [];
      const links = [];
      const one = sel.size === 1 ? [...sel][0] : null;
      if (vm.me >= 0 && vm.hand.length && !vm.over && dd.phase !== 'done') {
        if (vm.mustMeld) {
          const pts = C().evaluate(groups, wild()).points;
          primary.push(btn('data-a="automeld"', tr('autoGroup', 'Auto-group'), 'ghost'));
          primary.push(btn('data-a="meld"', tr('submit', 'Submit') + ' · ' + pts + ' ' + tr('pts', 'pts'), 'primary'));
        } else if (canDraw()) {
          if (dd.phase === 'upcard') {
            primary.push(btn('data-a="pass"', tr('pass', 'Pass'), 'ghost'));
            primary.push(btn('data-a="take"', tr('takeUp', 'Take upcard'), 'primary'));
          } else if (vm.canDrop) primary.push(btn('data-a="drop"', tr('drop', 'Drop') + ' (' + vm.dropCost + ')', 'fold'));
        } else if (canThrow()) {
          if (sel.size > 1) primary.push(btn('data-a="group"', tr('groupN', 'Group') + ' (' + sel.size + ')', 'ghost'));
          else if (one) {
            primary.push(btn('data-a="discard"', tr('throw', 'Throw'), vm.gin ? 'ghost' : 'primary'));
            if (vm.gin) {
              const pts = solveCached(vm.hand.filter((c) => c !== one), { gin: true }).points;
              primary.push(btn('data-a="knock"', pts === 0 ? tr('goGin', 'Gin!') : tr('knock', 'Knock') + ' (' + pts + ')', 'primary', pts > vm.set.knock));
            } else primary.push(btn('data-a="declare"', tr('declare', 'Declare'), 'ghost'));
          }
          if (vm.gin && vm.set.bigGin && vm.hand.length === 11 && solveCached(vm.hand, { gin: true }).points === 0) primary.push(btn('data-a="biggin"', tr('bigGin', 'Big Gin!'), 'primary'));
        }
        if (!vm.mustMeld && sel.size > 1 && !canThrow()) primary.push(btn('data-a="group"', tr('groupN', 'Group') + ' (' + sel.size + ')', 'ghost'));
        links.push(`<button type="button" class="pk-link" data-a="sort">${esc(vm.gin ? tr('arrange', 'Arrange') : tr('sort', 'Sort by suit'))}</button>`);
        if (!vm.gin && o.helper && o.helper() && !vm.mustMeld) links.push(`<button type="button" class="pk-link" data-a="suggest">${esc(tr('suggest', 'Suggest groups'))}</button>`);
        if (o.onSkip && !vm.gin && dd.active && !dd.active[vm.me]) links.push(`<button type="button" class="pk-link" data-a="skip">${esc(tr('skip', 'Skip to the result'))}</button>`);
      } else if (o.onSkip && !vm.over && dd.phase !== 'done' && vm.me >= 0 && !vm.hand.length) {
        links.push(`<button type="button" class="pk-link" data-a="skip">${esc(tr('skip', 'Skip to the result'))}</button>`);
      }
      const hint =
        !primary.length && vm.me >= 0 && vm.hand.length && !vm.over && dd.phase !== 'done'
          ? `<p class="rm-hint">${esc(canThrow() ? tr('hintThrow', 'Tap a card, then Throw — or drag it onto the open pile') : tr('hintGroup', 'Tap cards to select · drag to regroup'))}</p>`
          : '';
      barEl.innerHTML = (primary.length ? `<div class="pkr-bar">${primary.join('')}</div>` : hint) + (links.length ? `<div class="rm-links">${links.join('')}</div>` : '');
      barEl.querySelectorAll('[data-a]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset.a;
          if (a === 'pass') send('pass');
          else if (a === 'take') send('draw', { from: 'open' });
          else if (a === 'drop') doDrop();
          else if (a === 'group') groupSelected();
          else if (a === 'discard' && one) doDiscard(one);
          else if (a === 'declare' && one) doDeclare(one);
          else if (a === 'knock' && one) doKnock(one);
          else if (a === 'biggin') send('biggin');
          else if (a === 'meld') send('meld', { groups: groups.map((g) => g.slice()) });
          else if (a === 'automeld' || a === 'suggest') {
            groups = bestGroups(vm.hand, wild(), vm.gin);
            sel = new Set();
            paintHand();
            paintBar();
            if (a === 'suggest') toast(tr('suggested', 'Best grouping — the loose cards are on the right'));
          } else if (a === 'sort') {
            groups = vm.gin ? bestGroups(vm.hand, 0, true) : suitGroups(vm.hand, wild(), false);
            sel = new Set();
            paintHand();
            paintBar();
          } else if (a === 'skip' && o.onSkip) o.onSkip();
        })
      );
    }

    // ---------- results ----------

    function resultKind(r) {
      return (
        {
          win: tr('kWin', 'Valid show'),
          meld: tr('kMeld', 'Grouped'),
          auto: tr('kAuto', 'Auto-grouped'),
          first_drop: tr('kFirst', 'First drop'),
          middle_drop: tr('kMiddle', 'Middle drop'),
          wrong: tr('kWrong', 'Wrong show'),
          left: tr('kLeft', 'Left'),
          timeout: tr('kTimeout', 'Timed out'),
        }[r.kind] || r.kind
      );
    }
    function groupsHtml(gs, w) {
      return (gs || []).length ? `<div class="rm-res-groups">${gs.map((g) => `<span class="rm-res-g">${miniCards(g, w)}</span>`).join('')}</div>` : '';
    }
    function resultHtml() {
      const dd = d();
      if (vm.gin) {
        const r = dd.result;
        if (!r) return '';
        let body = '';
        if (r.kind !== 'draw') {
          const k = r.knocker || {};
          const df = r.defender || {};
          body = `<div class="rm-res-row${r.by === r.winner ? ' is-win' : ''}"><div class="rm-res-head"><b>${esc(nameOf(r.by))}</b><span>${esc(r.kind === 'gin' || r.kind === 'biggin' ? tr('gin0', 'Gin') : tr('deadwood', 'Deadwood') + ' ' + (k.points || 0))}</span></div>${groupsHtml(k.groups, 0)}${
            (k.dead || []).length ? `<div class="rm-res-dead">${miniCards(k.dead, 0)}</div>` : ''
          }</div>
          <div class="rm-res-row${r.by !== r.winner ? ' is-win' : ''}"><div class="rm-res-head"><b>${esc(nameOf(1 - r.by))}</b><span>${esc(tr('deadwood', 'Deadwood'))} ${df.points || 0}</span></div>${groupsHtml(df.groups, 0)}${
            (df.laid || []).length ? `<div class="rm-res-line"><span>${esc(tr('laidOff', 'Laid off'))}</span>${miniCards(df.laid, 0)}</div>` : ''
          }${(df.dead || []).length ? `<div class="rm-res-dead">${miniCards(df.dead, 0)}</div>` : ''}</div>`;
        }
        const bonus = r.kind === 'gin' ? ' · ' + tr('ginBonus', 'includes the 25 Gin bonus') : r.kind === 'undercut' ? ' · ' + tr('undercutBonus', 'includes the 25 undercut bonus') : r.kind === 'biggin' ? ' · ' + tr('bigGinBonus', 'includes the 31 Big Gin bonus') : '';
        const totals = vm.seats.map((s, i) => `<span class="rm-chip">${esc(nameOf(i))} ${s.score}</span>`).join('');
        return `<div class="rm-result"><div class="rm-result-title">${esc(dealLine())}</div><p class="cl-note">${esc(bonus.replace(/^ · /, ''))}</p>${body}<div class="rm-totals">${totals}<span class="rm-chip">${esc(tr('to', 'to'))} ${vm.set.target}</span></div></div>`;
      }
      const w = dd.wildRank;
      const rows = vm.seats
        .map((s, i) => {
          const r = (dd.results || [])[i];
          if (!r) return '';
          return `<div class="rm-res-row${i === dd.winner ? ' is-win' : ''}"><div class="rm-res-head"><b>${esc(nameOf(i))}</b><span>${esc(resultKind(r))} · ${r.points} ${esc(tr('pts', 'pts'))}</span></div>${groupsHtml(r.groups, w)}</div>`;
        })
        .join('');
      const fin = dd.finish ? `<div class="rm-res-line"><span>${esc(tr('finishCard', 'Finish card'))}</span>${miniCards([dd.finish], w)}</div>` : '';
      const board =
        vm.format === 'points'
          ? ''
          : `<div class="rm-totals">${vm.seats
              .map((s, i) => `<span class="rm-chip${s.out ? ' is-out' : ''}">${esc(nameOf(i))} ${s.score}${vm.format === 'pool' ? '/' + vm.set.pool : ''}${s.out ? ' · ' + esc(tr('out', 'Out')) : ''}</span>`)
              .join('')}</div>${vm.tiebreak && vm.tiebreak.length ? `<p class="cl-note">${esc(tr('tiebreak', 'Tied — one more deal between the leaders.'))}</p>` : ''}`;
      return `<div class="rm-result"><div class="rm-result-title">${esc(dealLine())}</div>${fin}${rows}${board}</div>`;
    }

    function coachHtml() {
      const rv = o.coach ? o.coach() : null;
      if (!rv) return '';
      return `<details class="rm-coach" open><summary>${esc(tr('coachTitle', 'Coach · this hand'))}</summary>
        <p class="rm-coach-text">${esc(rv.aiText || rv.text)}</p>
        ${rv.tips && rv.tips.length ? `<ul class="rm-coach-tips">${rv.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</details>`;
    }

    function paintFoot() {
      const dd = d();
      footEl.innerHTML = '';
      if (dd.phase === 'done' || vm.over) {
        const box = document.createElement('div');
        box.innerHTML = resultHtml() + coachHtml();
        footEl.appendChild(box);
        if (!vm.over) {
          const row = document.createElement('div');
          row.className = 'rm-next';
          const rejoin = vm.canRejoin ? `<button type="button" class="pk-btn pk-btn--ghost" data-rejoin>${esc(tr('rejoin', 'Rejoin'))}</button>` : '';
          row.innerHTML = o.onNextDeal
            ? `<div class="pk-row">${rejoin}<button type="button" class="pk-btn pk-btn--primary" data-next>${esc(vm.gin ? tr('nextHand', 'Next hand') : tr('nextDeal', 'Next deal'))}</button></div>`
            : `<div class="pk-row">${rejoin}<span class="rm-wait">${esc(tr('nextSoon', 'Next deal in a moment…'))}</span></div>`;
          footEl.appendChild(row);
          row.querySelector('[data-next]')?.addEventListener('click', () => o.onNextDeal());
          row.querySelector('[data-rejoin]')?.addEventListener('click', () => send('rejoin'));
        }
      }
      if (o.footer) {
        const box = document.createElement('div');
        footEl.appendChild(box);
        o.footer(vm, box);
      }
      const menu = o.menu ? o.menu() : [];
      if (menu.length) {
        const row = document.createElement('div');
        row.className = 'rm-menu';
        row.innerHTML = menu.map((m, i) => `<button type="button" class="pk-link" data-menu="${i}">${esc(m.label)}</button>`).join('');
        row.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => menu[Number(b.dataset.menu)].run()));
        footEl.appendChild(row);
      }
    }

    function render() {
      if (destroyed || !vm) return;
      syncGroups();
      paintTop();
      paintTable();
      paintHand();
      paintBar();
      paintFoot();
    }

    return {
      update(next) {
        vm = next;
        vm.d = vm.d || {};
        vm.d.open = arr(vm.d.open);
        vm.hand = arr(vm.hand);
        const turnKey = myTurn() || vm.mustMeld ? [vm.dealNo, vm.d.phase, vm.d.turn].join(':') : '';
        if (turnKey && turnKey !== lastTurnKey && !/:discard:/.test(turnKey)) {
          fx('turn');
          if (vm.live && Kit() && typeof Kit().ding === 'function') Kit().ding();
        }
        lastTurnKey = turnKey;
        if (drag && drag.on) return;
        render();
      },
      render,
      get vm() {
        return vm;
      },
      get root() {
        return host;
      },
      destroy() {
        destroyed = true;
        if (drag && drag.ghost) drag.ghost.remove();
      },
    };
  }

  function chipLine(vm) {
    if (!vm.chip) return '';
    if (vm.mode === 'gin') return '⚡' + vm.chip + ' ' + tr('stakeWord', 'stake');
    if (vm.format === 'points') return '⚡' + vm.chip + ' ' + tr('perPoint', 'per point');
    return tr('potWord', 'Pot') + ' ⚡' + (vm.pot || 0);
  }

  function buildVm(pubSt, priv, extra) {
    const p = priv || {};
    const seat = p.seat != null && p.seat >= 0 ? Number(p.seat) : -1;
    return Object.assign({}, pubSt, {
      d: pubSt.deal || {},
      me: seat,
      hand: arr(p.hand).filter(Boolean),
      myDrawn: p.drawnCard || null,
      canDrop: !!p.canDrop,
      dropCost: Number(p.dropCost) || 0,
      mustMeld: !!p.mustMeld,
      canRejoin: !!p.canRejoin,
      gin: pubSt.mode === 'gin',
      log: arr(pubSt.log).filter(Boolean),
      seats: arr(pubSt.seats).filter(Boolean),
      set: pubSt.set || {},
    }, extra || {});
  }

  // ---------------- coach AI (optional; grounded + deterministic fallback on the server) ----------------

  async function coachAi(review) {
    if (!review || typeof apiFetch !== 'function' || !Kit() || !Kit().isSignedIn()) return null;
    try {
      const res = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'dangal_ai', hook: 'coachExplain', input: { gameId: 'rummy', engineText: review.text, engineTips: review.tips, allowedCards: review.allowedCards } },
      });
      const data = res && res.ok && res.data;
      if (!data || data.source !== 'ai' || !data.data || !data.data.text) return null;
      const text = String(data.data.text).slice(0, 320);
      if (!Core().validateCoachText(text, review.allowedCards).ok) return null;
      return text;
    } catch (e) {
      return null;
    }
  }

  // ---------------- practice vs bots ----------------

  function startLocal(opts) {
    const K = Kit();
    const C = Core();
    const s = Object.assign(loadSetup(), opts || {});
    const gin = s.mode === 'gin';
    const nBots = gin ? 1 : Math.max(1, Math.min(5, Number(s.bots) || 1));
    const me = (K && K.myName()) || tr('you', 'You');
    const players = [{ id: 'me', name: me }];
    for (let i = 0; i < nBots; i++) players.push({ id: 'bot' + (i + 1), name: tr('bot', 'Bot') + (nBots > 1 ? ' ' + (i + 1) : '') + ' · ' + levelLabel(s.level), bot: true, level: s.level });
    const settings = { mode: s.mode, format: s.format, pool: s.pool, deals: s.deals, knock: s.knock, target: s.target, scoring: s.scoring, bigGin: !!s.bigGin };
    const rng = CK().seededRng(CK().newSeed());
    const st = C.newMatch(players, settings, rng);
    let mistakes = [];
    let review = null;
    let reviewDeal = -1;
    let botTimer = null;
    let recorded = false;
    const sub = formatLabel(Object.assign({}, C.mergeSettings(settings), { target: settings.target })) + ' · ' + tr('vs', 'vs') + ' ' + levelLabel(s.level);
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: sub,
      confirmLeave: () => !st.over && (st.dealNo > 1 || (st.deal && st.deal.turns.some((x) => x > 0))),
      leaveBody: tr('leaveLocal', 'This game will end.'),
      onClose: () => {
        clearTimeout(botTimer);
        view.destroy();
      },
    });
    const host = shell.render('<div class="pk-page rm-page" data-rm></div>').querySelector('[data-rm]');

    function vmNow() {
      return buildVm(C.publicView(st), C.privateView(st, 0), { live: false });
    }

    function dealWon() {
      const d = st.deal;
      if (!d) return false;
      return gin ? !!(d.result && d.result.winner === 0) : d.winner === 0;
    }

    function maybeReview() {
      const d = st.deal;
      if (!d || d.phase !== 'done' || reviewDeal === st.dealNo || !prefs().coach) return;
      reviewDeal = st.dealNo;
      const pts = !gin && d.results[0] ? d.results[0].points : null;
      review = C.coachReview(mistakes, { won: dealWon(), points: pts, gin });
      const mine = review;
      coachAi(mine).then((text) => {
        if (text && review === mine && !shell.closed) {
          mine.aiText = text;
          view.render();
        }
      });
    }

    function botMelds() {
      C.meldPending(st).forEach((i) => {
        if (st.seats[i].bot) C.apply(st, i, C.botAction(st, i, rng) || { type: 'auto_meld' }, { rng });
      });
    }

    function refresh() {
      if (!st.over && st.deal && st.deal.phase === 'meld') botMelds();
      maybeReview();
      view.update(vmNow());
      schedule();
    }

    function botStep() {
      const d = st.deal;
      if (st.over || !d || d.phase === 'done') return false;
      if (d.phase === 'meld') {
        botMelds();
        return C.meldPending(st).some((i) => st.seats[i].bot);
      }
      const t = d.turn;
      if (!st.seats[t] || !st.seats[t].bot) return false;
      const top = d.open[d.open.length - 1];
      const mineLast = (d.discards[0] || [])[d.discards[0].length - 1];
      let a = C.botAction(st, t, rng);
      let out = a ? C.apply(st, t, a, { rng }) : { error: 'none' };
      if (out.error) {
        a = C.autoAction(st, t);
        out = a ? C.apply(st, t, a, { rng }) : out;
      }
      if (!out.error && a && a.type === 'draw' && a.from === 'open' && top && top === mineLast && prefs().coach) {
        mistakes.push({ kind: 'fed', turn: d.turns[0] || 1, card: top, who: st.seats[t].name, impact: 3 });
      }
      if (!out.error && a && (a.type === 'discard' || a.type === 'knock')) fx('place');
      return !out.error;
    }

    function schedule() {
      clearTimeout(botTimer);
      if (st.over || shell.closed) return;
      const d = st.deal;
      if (!d || d.phase === 'done' || d.phase === 'meld') return;
      if (!st.seats[d.turn] || !st.seats[d.turn].bot) return;
      botTimer = setTimeout(() => {
        if (shell.closed) return;
        botStep();
        refresh();
      }, CK().ms(st.deal.phase === 'discard' ? 650 : 800));
    }

    function localAct(type, args) {
      const a = Object.assign({ type }, args || {});
      let out;
      if (type === 'rejoin') out = C.rejoin(st, 0);
      else {
        if (prefs().coach) {
          const m = C.coachCheck(st, 0, a);
          if (m) mistakes.push(m);
        }
        out = C.apply(st, 0, a, { rng });
      }
      if (out.error) {
        fx('invalid');
        toast(ERRORS[out.error] || tr('notAllowed', 'Not allowed right now'));
        return out;
      }
      if (type === 'declare') {
        if (out.valid) fx('win');
        else {
          fx('invalid');
          toast(tr('wrongToast', 'Wrong show — 80 points.') + ' ' + reasonText(out.reason));
        }
      } else if (type === 'discard' || type === 'knock') fx('place');
      refresh();
      return out;
    }

    function skip() {
      clearTimeout(botTimer);
      let guard = 0;
      const startDeal = st.dealNo;
      while (!st.over && st.deal && st.deal.phase !== 'done' && st.dealNo === startDeal && guard++ < 4000) {
        const d = st.deal;
        if (d.phase !== 'meld' && !st.seats[d.turn].bot) break;
        if (!botStep()) break;
      }
      refresh();
    }

    function onNextDeal() {
      const out = C.nextDeal(st, rng);
      if (out.error) return;
      mistakes = [];
      review = null;
      refresh();
    }

    const view = createView(host, {
      practice: true,
      act: localAct,
      onNextDeal,
      onSkip: skip,
      helper: () => !!prefs().helper,
      coach: () => (st.deal && st.deal.phase === 'done' && prefs().coach ? review : null),
      footer(vm, el) {
        if (!st.over) return;
        const won = st.winner === 0;
        if (!recorded) {
          recorded = true;
          fx(won ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { mode: 'practice', level: s.level, variant: gin ? 'gin' : s.format });
        }
        const line = finalLine(vm, 0);
        el.innerHTML = `<div class="cl-result"><div class="rm-result-line">${esc(line)}</div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-share>${esc(tr('share', 'Share'))}</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('change', 'Change game'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(s)));
        el.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
        el.querySelector('[data-share]').addEventListener('click', () => CK().shareWin(GAME, LABEL, line + ' · ' + formatLabel(s) + ' vs ' + levelLabel(s.level) + ' ' + tr('botLower', 'bots')));
      },
      menu: () => [
        { label: tr('rules', 'Rules'), run: () => openRules(s.mode, s.format) },
        { label: tr('settings', 'Settings'), run: () => openPrefs(() => view.render()) },
      ],
    });
    refresh();
  }

  function finalLine(vm, meSeat) {
    const w = vm.winner;
    const who = w === meSeat ? tr('youWin', 'You win') : w >= 0 && vm.seats[w] ? vm.seats[w].name + ' ' + tr('wins', 'wins') : tr('gameOver', 'Game over');
    if (vm.mode === 'gin' && vm.final && vm.final.totals) {
      const t = vm.final.totals;
      return who + ' ' + t[w] + '–' + t[1 - w] + (vm.final.shutout ? ' · ' + tr('shutout', 'shutout') : '');
    }
    if (vm.mode === 'gin' && vm.final && vm.final.forfeit) return who + ' · ' + tr('byForfeit', 'by forfeit');
    if (vm.format === 'pool') return who + ' ' + tr('thePool', 'the pool');
    if (vm.format === 'deals' && w >= 0 && vm.seats[w]) return who + ' · ' + vm.seats[w].score + ' ' + tr('scoreWord', 'score');
    if (vm.format === 'points' && meSeat >= 0 && vm.seats[meSeat] && w !== meSeat) return who + ' · ' + tr('youScored', 'you finished on') + ' ' + vm.seats[meSeat].score + ' ' + tr('pts', 'pts');
    return who;
  }

  function openRules(mode, format) {
    if (window.DangalRules && window.DangalRules.openSheet) window.DangalRules.openSheet(GAME, { variants: { mode: mode || localeMode(), format: format || 'points' } });
  }

  function openPrefs(onChange) {
    const K = Kit();
    const p = prefs();
    const ck = CK().prefs();
    K.openSheet({
      title: tr('settings', 'Settings'),
      bodyHtml: `<div class="cl-prefs">
        <label class="cl-pref"><span>${esc(tr('coachPref', 'Coach review after each practice hand'))}</span><input type="checkbox" data-p="coach" ${p.coach ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('helperPref', 'Beginner helpers in practice (suggest groups, useful open cards)'))}</span><input type="checkbox" data-p="helper" ${p.helper ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('soundPref', 'Sounds'))}</span><input type="checkbox" data-ck="sound" ${ck.sound ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('hapticPref', 'Vibration'))}</span><input type="checkbox" data-ck="haptics" ${ck.haptics ? 'checked' : ''}></label>
      </div>`,
      onMount(el) {
        el.querySelectorAll('[data-p]').forEach((box) =>
          box.addEventListener('change', () => {
            setPref(box.dataset.p, box.checked);
            if (onChange) onChange();
          })
        );
        el.querySelectorAll('[data-ck]').forEach((box) => box.addEventListener('change', () => CK().setPref(box.dataset.ck, box.checked)));
      },
    });
  }

  function openLocalSheet(onGo) {
    const K = Kit();
    const s = loadSetup();
    const p = prefs();
    K.openSheet({
      title: tr('setupTitle', 'Play vs bots'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('game', 'Game'))}</div>${K.segHtml('mode', s.mode, [['13', tr('thirteen', '13-card Rummy')], ['gin', tr('gin', 'Gin Rummy')]])}
        <div data-13>
          <div class="cl-sub">${esc(tr('format', 'Format'))}</div>${K.segHtml('format', s.format, [['points', tr('fPoints', 'Points')], ['pool', tr('fPool', 'Pool')], ['deals', tr('fDeals', 'Deals')]])}
          <div data-pool><div class="cl-sub">${esc(tr('poolLimit', 'Pool limit'))}</div>${K.segHtml('pool', s.pool, [[101, '101'], [201, '201']])}</div>
          <div data-deals><div class="cl-sub">${esc(tr('dealsN', 'Deals'))}</div>${K.segHtml('deals', s.deals, [[2, '2'], [3, '3'], [6, '6']])}</div>
          <div class="cl-sub">${esc(tr('opponents', 'Bots at the table'))}</div>${K.segHtml('bots', s.bots, [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']])}
        </div>
        <div data-gin>
          <div class="cl-sub">${esc(tr('knockAt', 'Knock at'))}</div>${K.segHtml('knock', s.knock, [[10, '10'], [5, '5'], [0, tr('ginOnly', 'Gin only')]])}
          <div class="cl-sub">${esc(tr('gameTo', 'Game to'))}</div>${K.segHtml('target', s.target, [[100, '100'], [50, '50']])}
          <details class="cl-more"><summary>${esc(tr('more', 'More'))}</summary>
            <div class="cl-sub">${esc(tr('scoring', 'Scoring'))}</div>${K.segHtml('scoring', s.scoring, [['simple', tr('simple', 'Simple')], ['classic', tr('classic', 'Classic bonuses')]])}
            <label class="cl-pref"><span>${esc(tr('bigGinPref', 'Big Gin (all 11 cards melded, +31)'))}</span><input type="checkbox" data-biggin ${s.bigGin ? 'checked' : ''}></label>
          </details>
        </div>
        <div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml('level', s.level, LEVELS.map((l) => [l, levelLabel(l)]))}
        <label class="cl-pref"><span>${esc(tr('coachPref', 'Coach review after each practice hand'))}</span><input type="checkbox" data-coach ${p.coach ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('helperShort', 'Beginner helpers'))}</span><input type="checkbox" data-helper ${p.helper ? 'checked' : ''}></label>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('start', 'Start'))}</button>
      </div>`,
      onMount(el, close) {
        const paint = () => {
          el.querySelector('[data-13]').hidden = s.mode === 'gin';
          el.querySelector('[data-gin]').hidden = s.mode !== 'gin';
          el.querySelector('[data-pool]').hidden = s.format !== 'pool';
          el.querySelector('[data-deals]').hidden = s.format !== 'deals';
        };
        paint();
        K.wireSegs(el, s, paint);
        el.querySelector('[data-go]').addEventListener('click', () => {
          ['pool', 'deals', 'bots', 'knock', 'target'].forEach((k) => (s[k] = Number(s[k])));
          s.bigGin = el.querySelector('[data-biggin]').checked;
          setPref('coach', el.querySelector('[data-coach]').checked);
          setPref('helper', el.querySelector('[data-helper]').checked);
          writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onGo(Object.assign({}, s)), 80);
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function roomSettings(ctrl) {
    return Object.assign(
      { mode: localeMode(), format: 'points', pool: 101, deals: 2, rate: 0, fee: 0, stake: 0, bots: 0, botLevel: 'normal', knock: 10, target: 100, scoring: 'simple', bigGin: false },
      (ctrl.view.pub && ctrl.view.pub.settings) || {}
    );
  }
  function chipOf(s) {
    return Core().chipAmount(s);
  }
  function isChipTable(s) {
    return chipOf(s) > 0 && !(Number(s.bots) > 0);
  }
  function chipLabel(s) {
    const c = chipOf(s);
    if (!c || Number(s.bots) > 0) return tr('friendly', 'Friendly (no chips)');
    if (s.mode === 'gin') return '⚡' + c + ' ' + tr('stakeWord', 'stake') + ' · 18+';
    if (s.format === 'points') return '⚡' + c + ' ' + tr('perPoint', 'per point') + ' · 18+';
    return '⚡' + c + ' ' + tr('entry', 'entry') + ' · 18+';
  }
  function lobbySummary(ctrl) {
    const s = roomSettings(ctrl);
    const bits = [formatLabel(s), chipLabel(s)];
    if (Number(s.bots) > 0) bits.push(s.bots + ' ' + (Number(s.bots) === 1 ? tr('botOne', 'bot') : tr('botMany', 'bots')) + ' · ' + levelLabel(s.botLevel));
    return bits.join(' · ');
  }
  function canStart(ctrl, players) {
    const s = roomSettings(ctrl);
    const bots = Number(s.bots) || 0;
    const total = players.length + bots;
    if (s.mode === 'gin') {
      if (players.length > 2) return { ok: false, label: tr('ginTwo', 'Gin is for two players') };
      if (total < 2) return { ok: false, label: tr('waitOpp', 'Waiting for an opponent — or add a bot') };
      return { ok: true, label: tr('start', 'Start') };
    }
    if (total < 2) return { ok: false, label: tr('waitPlayers', 'Waiting for players — or add bots') };
    if (players.length > 6) return { ok: false, label: tr('tooMany', 'Rummy seats up to six') };
    return { ok: true, label: bots ? tr('startBots', 'Start with bots') : tr('start', 'Start') };
  }

  async function adultOk() {
    if (typeof ageGateStatus !== 'function' || ageGateStatus() === 'ok') return true;
    return typeof openAgeGateSheet === 'function' ? openAgeGateSheet(GAME) : false;
  }

  function openRoomSettings(ctrl) {
    const K = Kit();
    const C = Core();
    const cur = roomSettings(ctrl);
    const chipSeg = (key, list) => K.segHtml(key, cur[key], list.map((n) => [n, n ? '⚡' + n : tr('friendlyShort', 'Friendly')]));
    K.openSheet({
      title: tr('roomSettings', 'Table settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('game', 'Game'))}</div>${K.segHtml('mode', cur.mode, [['13', tr('thirteen', '13-card Rummy')], ['gin', tr('gin', 'Gin Rummy')]])}
        <div data-13>
          <div class="cl-sub">${esc(tr('format', 'Format'))}</div>${K.segHtml('format', cur.format, [['points', tr('fPoints', 'Points')], ['pool', tr('fPool', 'Pool')], ['deals', tr('fDeals', 'Deals')]])}
          <div data-pool><div class="cl-sub">${esc(tr('poolLimit', 'Pool limit'))}</div>${K.segHtml('pool', cur.pool, [[101, '101'], [201, '201']])}</div>
          <div data-deals><div class="cl-sub">${esc(tr('dealsN', 'Deals'))}</div>${K.segHtml('deals', cur.deals, [[2, '2'], [3, '3'], [6, '6']])}</div>
          <div data-rate><div class="cl-sub">${esc(tr('ratePer', 'Chips per point'))}</div>${chipSeg('rate', C.RATES)}</div>
          <div data-fee><div class="cl-sub">${esc(tr('entryFee', 'Entry'))}</div>${chipSeg('fee', C.FEES)}</div>
          <div class="cl-sub">${esc(tr('botSeats', 'Bots'))}</div>${K.segHtml('bots', cur.bots, [[0, tr('none0', 'None')], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']])}
        </div>
        <div data-gin>
          <div class="cl-sub">${esc(tr('stake', 'Stake'))}</div>${chipSeg('stake', C.STAKES)}
          <div class="cl-sub">${esc(tr('knockAt', 'Knock at'))}</div>${K.segHtml('knock', cur.knock, [[10, '10'], [5, '5'], [0, tr('ginOnly', 'Gin only')]])}
          <div class="cl-sub">${esc(tr('gameTo', 'Game to'))}</div>${K.segHtml('target', cur.target, [[100, '100'], [50, '50']])}
          <div class="cl-sub">${esc(tr('scoring', 'Scoring'))}</div>${K.segHtml('scoring', cur.scoring, [['simple', tr('simple', 'Simple')], ['classic', tr('classic', 'Classic bonuses')]])}
          <div class="cl-sub">${esc(tr('botSeat', 'Bot opponent'))}</div>${K.segHtml('bots', Math.min(1, cur.bots), [[0, tr('none0', 'None')], [1, tr('addBot', 'Add a bot')]])}
        </div>
        <div data-lvl><div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml('botLevel', cur.botLevel, LEVELS.map((l) => [l, levelLabel(l)]))}</div>
        <p class="cl-note" data-note></p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        const paint = () => {
          const gin = cur.mode === 'gin';
          el.querySelector('[data-13]').hidden = gin;
          el.querySelector('[data-gin]').hidden = !gin;
          el.querySelector('[data-pool]').hidden = cur.format !== 'pool';
          el.querySelector('[data-deals]').hidden = cur.format !== 'deals';
          el.querySelector('[data-rate]').hidden = cur.format !== 'points';
          el.querySelector('[data-fee]').hidden = cur.format === 'points';
          el.querySelector('[data-lvl]').hidden = !(Number(cur.bots) > 0);
          const s = Object.assign({}, cur, { bots: gin ? Math.min(1, Number(cur.bots) || 0) : Number(cur.bots) || 0 });
          el.querySelector('[data-note]').textContent =
            Number(s.bots) > 0
              ? tr('botNote', 'Bots are labelled and keep the table friendly — no chips move.')
              : isChipTable(s)
                ? tr('chipNote', 'Virtual chips only — they can’t be bought or cashed out. Chip tables are 18+.')
                : tr('friendlyNote', 'Friendly table: scores only, open to everyone.');
        };
        paint();
        K.wireSegs(el, cur, paint);
        el.querySelector('[data-save]').addEventListener('click', async () => {
          ['pool', 'deals', 'rate', 'fee', 'stake', 'bots', 'knock', 'target'].forEach((k) => (cur[k] = Number(cur[k]) || 0));
          if (cur.mode === 'gin') cur.bots = Math.min(1, cur.bots);
          if (isChipTable(cur) && !(await adultOk())) return;
          const out = await ctrl.act('settings', { settings: cur });
          if (out) close();
        });
      },
    });
  }

  function hydratePub(raw) {
    const s = clone(raw || {});
    const d0 = s.deal || null;
    const closed = d0 ? Number(d0.closed) || 0 : 0;
    const counts = d0 ? arr(d0.counts).map((x) => Number(x) || 0) : [];
    const handsShown = d0 && d0.hands ? true : false;
    Core().hydrate(s);
    if (s.deal) {
      s.deal.closed = closed;
      s.deal.counts = counts;
      if (!handsShown) s.deal.hands = null;
      s.deal.openCount = Number(s.deal.openCount) || s.deal.open.length;
    }
    s.bank = arr(s.bank);
    return s;
  }

  const LIVE_ERRORS = ['NOT_YOUR_TURN', 'PHASE', 'JOKER_PICK', 'SAME_CARD', 'NO_CARD', 'BAD_GROUPS', 'NO_DROP', 'CANT_KNOCK', 'STOCK_ONLY', 'NO_BIGGIN', 'NO_REJOIN', 'DONE', 'OVER', 'EMPTY'];
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (LIVE_ERRORS.indexOf(code) >= 0 && e.message) return e.message;
    return Kit().roomErrorText(e);
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const sec = ctrl.view.secret;
    const secOk = sec && Number(sec.roundNo) === Number(pub.roundNo) && Number(sec.dealNo) === Number(st.dealNo);
    const vm = buildVm(st, secOk ? sec : { seat: st.seats.findIndex((x) => x.id === ctrl.uid && !x.bot) }, {
      live: true,
      chip: Number(st.chip) || 0,
      pot: Number(st.pot) || 0,
      inBank: !!st.inBank,
    });
    const mounted = ctrl.rm && ctrl.rm.round === pub.roundNo && ctrl.shell.el.contains(ctrl.rm.view.root);
    if (!mounted) {
      if (ctrl.rm) ctrl.rm.view.destroy();
      const host = ctrl.render('<div class="pk-page rm-page" data-rm></div>').querySelector('[data-rm]');
      const view = createView(host, {
        live: true,
        act: async (type, args) => {
          const out = await ctrl.act(type, args);
          if (out && type === 'declare' && out.valid === false) toast(tr('wrongToast', 'Wrong show — 80 points.') + ' ' + reasonText(out.reason));
          return out || { error: 'failed' };
        },
        onHud: (el) => {
          if (ctrl.timer) ctrl.timer.stop();
          ctrl.timer = null;
          ctrl.wire(el);
        },
        footer: (v, el) => liveFooter(ctrl, v, el),
        menu: () => {
          const v = ctrl.rm && ctrl.rm.view.vm;
          const items = [
            { label: tr('rules', 'Rules'), run: () => openRules(v && v.mode, v && v.format) },
            { label: tr('settings', 'Settings'), run: () => openPrefs() },
          ];
          if (v && v.gin && v.me >= 0 && !v.over) {
            items.push({
              label: tr('resign', 'Resign'),
              run: async () => {
                const go = await confirmSheet(tr('resignQ', 'Resign this game?'), tr('resignBody', 'Your opponent wins the game.'), tr('resign', 'Resign'), tr('keepPlaying', 'Keep playing'));
                if (go) ctrl.act('resign');
              },
            });
          }
          return items;
        },
      });
      ctrl.rm = { round: pub.roundNo, view };
      if (!ctrl.rmWrapped) {
        ctrl.rmWrapped = true;
        const close = ctrl.shell.close;
        ctrl.shell.close = function () {
          if (ctrl.rm) ctrl.rm.view.destroy();
          return close.apply(this, arguments);
        };
      }
    }
    ctrl.rm.view.update(vm);
  }

  function liveFooter(ctrl, vm, el) {
    if (!vm.over) return;
    const pub = ctrl.view.pub;
    const set = pub.settlement;
    const r = set && set.results && set.results[ctrl.uid];
    if (ctrl.rmFx !== pub.roundNo && vm.me >= 0) {
      ctrl.rmFx = pub.roundNo;
      const won = vm.winner === vm.me;
      fx(won ? 'win' : 'lose');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { live: true, variant: vm.gin ? 'gin' : vm.format });
    }
    const line = finalLine(vm, vm.me);
    const bits = [];
    if (r && r.chipDelta) bits.push(`<div class="cl-result-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta} ${esc(tr('chips', 'virtual chips'))}</div>`);
    if (r && r.eloDelta) bits.push(`<div class="rm-elo">${esc(tr('rating', 'Rating'))} ${r.eloDelta > 0 ? '+' : ''}${r.eloDelta}</div>`);
    if (set && set.status === 'pending') bits.push(`<div class="rm-wait">${esc(tr('settling', 'Recording the result…'))}</div>`);
    el.innerHTML = `<div class="cl-result"><div class="rm-result-line">${esc(line)}</div>${bits.join('')}
      ${Kit().roomResultActions(ctrl, { nextLabel: tr('rematch', 'New game'), waitLabel: tr('waitRematch', 'Waiting for the host to start a new game…') })}</div>`;
    Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, line + ' · ' + formatLabel(Object.assign({}, vm.set, { mode: vm.mode, format: vm.format }))) });
  }

  async function joinWithGate(code) {
    const K = Kit();
    for (let tries = 0; tries < 2; tries++) {
      try {
        const res = await K.roomCall(GAME, 'join', { code, name: K.myName() || 'Player' });
        if (res.pending) toast(tr('pendingJoin', 'Game in progress — you’ll be dealt in next game'));
        return true;
      } catch (e) {
        const c = String((e && e.code) || '').toUpperCase();
        if (c === 'AGE_CONFIRM' && tries === 0 && typeof openAgeGateSheet === 'function') {
          if (await openAgeGateSheet(GAME)) continue;
          return false;
        }
        toast(K.roomErrorText(e) || tr('joinFail', 'Couldn’t join that table'));
        return false;
      }
    }
    return false;
  }

  async function openRoom(code, opts) {
    const K = Kit();
    const o = opts || {};
    if (o.join) {
      if (!K.requireSignIn()) return null;
      if (!(await joinWithGate(code))) return null;
    }
    return K.openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: false,
      min: 1,
      max: 6,
      hydrate: hydratePub,
      lobbySummary,
      openSettings: openRoomSettings,
      canStart,
      errorText,
      renderPhase: renderLive,
      onLobbyMount(ctrl, body) {
        if (ctrl.rm) {
          ctrl.rm.view.destroy();
          ctrl.rm = null;
        }
        const s = roomSettings(ctrl);
        const sec = body.querySelector('.pk-section');
        if (sec) sec.textContent = tr('atTable', 'At the table') + ' · ' + ctrl.players().length + '/' + (s.mode === 'gin' ? 2 : 6);
        if (typeof ageGateStatus === 'function' && ageGateStatus() !== 'ok' && ageGateStatus() !== 'under_18') {
          const note = document.createElement('button');
          note.type = 'button';
          note.className = 'pk-link';
          note.textContent = tr('confirmAdult', 'Confirm you’re 18+ (needed for chip tables)');
          note.addEventListener('click', async () => {
            if (await openAgeGateSheet(GAME)) {
              await K.roomCall(GAME, 'join', { code, name: K.myName() || 'Player' }).catch(() => {});
              note.remove();
            }
          });
          body.querySelector('.pk-lobby')?.appendChild(note);
        }
      },
    });
  }

  function createRoom(chat, settings) {
    const s = Object.assign({ mode: loadSetup().mode, format: 'points', rate: 0, fee: 0, stake: 0, bots: 0 }, settings || {});
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: s, open: (code) => openRoom(code, {}) });
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Cards') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🃏'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Draw, throw, meld. 13-card Rummy and Gin Rummy.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot"><span class="pk-mode-title">${esc(tr('vsBots', 'Play vs bots'))}</span><span class="pk-mode-sub">${esc(formatLabel(s) + ' · ' + levelLabel(s.level))}</span></button>
        <button type="button" class="pk-mode" data-go="friends"><span class="pk-mode-title">${esc(tr('friends', 'Play friends'))}</span><span class="pk-mode-sub">${esc(tr('friendsSub', 'Live table for 2–6 · Points, Pool, Deals or Gin'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="other">${esc(s.mode === 'gin' ? tr('play13', 'Play 13-card Rummy') : tr('playGin', 'Play Gin Rummy'))}</button>
          <button type="button" class="pk-link" data-go="change">${esc(tr('change', 'Change game'))}</button>
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a table code? Join'))}</button>
          <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'Rules'))}</button>
          <button type="button" class="pk-link" data-go="settings">${esc(tr('settings', 'Settings'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="bot"]').addEventListener('click', () => K.closeThen(shell, () => startLocal(loadSetup())));
    b.querySelector('[data-go="other"]').addEventListener('click', () => {
      const next = Object.assign(loadSetup(), { mode: s.mode === 'gin' ? '13' : 'gin' });
      writeJson(SETUP_KEY, next);
      K.closeThen(shell, () => startLocal(next));
    });
    b.querySelector('[data-go="change"]').addEventListener('click', () => openLocalSheet((x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="friends"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      createRoom(opts.chat);
    });
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
    b.querySelector('[data-go="rules"]').addEventListener('click', () => openRules(s.mode, s.format));
    b.querySelector('[data-go="settings"]').addEventListener('click', () => openPrefs());
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Rummy is still loading — try again'));
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
      id: 'rummy',
      name: 'Rummy',
      desc: '13-card · Gin · bots · Live tables',
      icon: '🃏',
      ratingKey: 'rummy',
      gameType: 'dual',
      genre: 'cards',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 33,
      meta: {
        core: 'rummy-core.js (13-card + Gin rules, solver, bots, coach — shared with the server)',
        live: 'party_room → server-lib/rummy-engine.js; server deal, private hands, 2 players rated, 3+ chip ledger',
      },
      launch: openGame,
    });
  }

  window.RummyGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal), _createView: createView, _buildVm: buildVm, _hydratePub: hydratePub };
  window.openRummy = function (ctx) {
    openGame(Object.assign({ source: 'manch', mode: 'home' }, ctx || {}));
  };
})();
