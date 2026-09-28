/**
 * Teen Patti (Dangal P8) — Classic · Muflis · AK47 · Joker. 18+ everywhere.
 * Practice vs bots (Easy / Normal / Smart) with play chips — no wallet impact — and Live tables
 * through a party room: the server (server-lib/teenpatti-engine.js) shuffles, deals and validates
 * every bet, show and side show with teenpatti-core.js. Your cards reach this phone only after you look.
 */
(function () {
  'use strict';

  const GAME = 'teenpatti';
  const LABEL = 'Teen Patti';
  const SETUP_KEY = 'chaupaal_teenpatti_setup';
  const Core = () => window.TeenPattiCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('teenpatti.' + key, fallback) : fallback;
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

  const RANK_SHORT = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RANK_PLURAL = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
  const LEVELS = ['easy', 'normal', 'smart'];
  function levelLabel(l) {
    return { easy: tr('lvl.easy', 'Easy'), normal: tr('lvl.normal', 'Normal'), smart: tr('lvl.smart', 'Smart') }[l] || l;
  }
  function variantLabel(v) {
    return { classic: tr('v.classic', 'Classic'), muflis: tr('v.muflis', 'Muflis'), ak47: tr('v.ak47', 'AK47'), joker: tr('v.joker', 'Joker') }[v] || tr('v.classic', 'Classic');
  }
  function variantNote(v) {
    return (
      {
        muflis: tr('n.muflis', 'Lowest hand wins — the ranking is reversed.'),
        ak47: tr('n.ak47', 'Every Ace, King, 4 and 7 is wild.'),
        joker: tr('n.joker', 'A card is cut each hand; its rank is wild.'),
      }[v] || tr('n.classic', 'Trail > Pure sequence > Sequence > Colour > Pair > High card.')
    );
  }
  function loadSetup() {
    const s = Object.assign({ variant: 'classic', bots: 3, level: 'normal', blindMax: 4, potX: 50, hands: 10 }, readJson(SETUP_KEY, {}));
    if (LEVELS.indexOf(s.level) < 0) s.level = 'normal';
    s.bots = Math.max(2, Math.min(6, Number(s.bots) || 3));
    return s;
  }
  async function adultOk() {
    if (typeof ageGateStatus !== 'function' || ageGateStatus() === 'ok') return true;
    return typeof openAgeGateSheet === 'function' ? openAgeGateSheet(GAME) : false;
  }

  // ---------------- cards ----------------

  function cardHtml(c, size, o) {
    const opt = o || {};
    const sz = size || 'md';
    if (!c) return `<span class="pkr-card pkr-card--${sz} pkr-card--back" aria-hidden="true"></span>`;
    const C = Core();
    const r = C.rankOf(c);
    const s = C.suitOf(c);
    const red = s === 'H' || s === 'D';
    const wild = opt.wild && opt.wild.indexOf(r) >= 0;
    const name = RANK_SHORT[r] + ' ' + { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[s] + (wild ? ' (wild)' : '');
    return `<span class="pkr-card pkr-card--${sz}${red ? ' is-red' : ''}${wild ? ' tp-wild' : ''}${opt.dim ? ' is-dim' : ''}" role="img" aria-label="${esc(name)}"><b>${RANK_SHORT[r]}</b><i>${C.SUIT_SYMBOLS[s]}</i></span>`;
  }
  const cardsHtml = (list, size, o) => (list || []).map((c) => cardHtml(c, size, o)).join('');

  function openRankings(variant) {
    const rows = [
      [tr('r.trail', 'Trail'), ['AS', 'AH', 'AD'], tr('r.trailD', 'Three of a kind. A-A-A is the best hand.')],
      [tr('r.pure', 'Pure sequence'), ['AS', 'KS', 'QS'], tr('r.pureD', 'Three in a row, one suit.')],
      [tr('r.seq', 'Sequence'), ['AH', '2S', '3D'], tr('r.seqD', 'Three in a row. A-K-Q is the top, A-2-3 second, then K-Q-J… down to 4-3-2. No K-A-2.')],
      [tr('r.colour', 'Colour'), ['KD', '9D', '4D'], tr('r.colourD', 'Three of one suit, not in a row. Compare the highest card first.')],
      [tr('r.pair', 'Pair'), ['QC', 'QH', '7S'], tr('r.pairD', 'Two of a rank; the higher pair wins, then the odd card.')],
      [tr('r.high', 'High card'), ['AC', '10D', '6S'], tr('r.highD', 'Nothing else: highest card, then the next.')],
    ];
    Kit().openSheet({
      title: tr('rankTitle', 'Hand rankings'),
      bodyHtml: `<div class="pkr-rankings">${rows
        .map(
          (r, i) => `<div class="pkr-rank-row"><span class="pkr-rank-n">${i + 1}</span><div class="pkr-rank-main">
          <div class="pkr-rank-name">${esc(r[0])}</div><div class="pkr-rank-cards">${cardsHtml(r[1].map((c) => c.replace('10', 'T')), 'xs')}</div>
          <div class="pkr-rank-desc">${esc(r[2])}</div></div></div>`
        )
        .join('')}
        <p class="pkr-note">${esc(tr('rankNote', 'Suits never rank. On equal hands at a show, the player who asked loses; at a pot-limit show, equal hands split.'))}${variant && variant !== 'classic' ? ' ' + esc(variantNote(variant)) : ''}</p></div>`,
    });
  }

  // ---------------- table view (practice + Live) ----------------

  function seatPos(k, n) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
    return { x: 50 + 41 * Math.cos(a), y: 49 + 41 * Math.sin(a) };
  }

  /**
   * vm = publicView (+ chip / inBank) and the viewer's private view { seat, seen, cards, name, peek, legal }.
   * @param {object} shellLike { render(html) → element }
   * @param {{ live?: boolean, act: (type, args?) => any, onNext?: () => void, onSkip?: () => void,
   *   footer?: (vm, el) => void, menu?: () => {label,run}[], onHud?: (el) => void }} o
   */
  function createTable(host, o) {
    host.innerHTML = `<div class="pkr-wrap tp-wrap">
      <div class="pkr-top"><div class="pkr-status" data-status aria-live="polite"></div>
        <button type="button" class="pkr-icon-btn" data-rankings aria-label="${esc(tr('rankTitle', 'Hand rankings'))}">★</button></div>
      <div class="pkr-felt-wrap"><div class="pkr-felt">
        <div class="pkr-center"><div class="pkr-pot" data-pot></div><div class="tp-stake" data-stake></div><div class="pkr-result" data-result aria-live="polite"></div></div>
        <div data-seats></div></div></div>
      <div class="pkr-hand tp-hand" data-hand></div>
      <div class="pkr-actions" data-actions></div>
      <div class="tp-foot" data-foot></div>
    </div>`;
    let vm = null;
    let pending = false;
    let destroyed = false;
    let lastTurn = '';
    host.querySelector('[data-rankings]').addEventListener('click', () => openRankings(vm && vm.variant));
    const h = () => (vm && vm.hand) || null;
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

    function seatHtml(i, k, n) {
      const s = vm.seats[i];
      const hh = h();
      const p = seatPos(k, n);
      const inHand = hh && hh.inHand[i];
      const done = hh && hh.phase === 'done';
      const shown = hh && hh.result && hh.result.shown && hh.result.shown[i];
      const won = hh && hh.result && hh.result.won && hh.result.won[i];
      const turn = hh && !done && !vm.over && ((hh.phase === 'bet' && hh.turn === i) || (hh.phase === 'sideshow' && hh.side && hh.side.to === i));
      const cls = ['pkr-seat'];
      if (i === vm.me) cls.push('is-me');
      if (turn) cls.push('is-turn');
      if (hh && hh.dealt[i] && !inHand && !done) cls.push('is-folded');
      if (s.out || s.left) cls.push('is-out');
      if (won) cls.push('is-win');
      let cards = '';
      if (shown) cards = cardsHtml(shown, 'xs', { wild: hh.wild });
      else if (hh && hh.dealt[i] && inHand && i !== vm.me) cards = cardHtml(null, 'xs') + cardHtml(null, 'xs') + cardHtml(null, 'xs');
      const tag = won ? '+' + won : s.left ? tr('left', 'Left') : s.out ? tr('out', 'Out') : s.away ? tr('away', 'Away') : (hh && hh.last[i]) || '';
      const bs = hh && hh.dealt[i] && inHand && !done ? `<span class="tp-bs ${hh.seen[i] ? 'is-seen' : 'is-blind'}">${esc(hh.seen[i] ? tr('seen', 'Seen') : tr('blind', 'Blind'))}</span>` : '';
      const presence = vm.live && !s.bot ? `<span class="pk-dot" data-presence="${esc(s.id)}"></span>` : '';
      const handName = shown && hh.result.names ? hh.result.names[i] : '';
      return `<div class="${cls.join(' ')}" style="left:${p.x.toFixed(1)}%;top:${p.y.toFixed(1)}%">
        ${cards ? `<div class="pkr-seat-cards">${cards}</div>` : ''}
        <div class="pkr-seat-plate">${vm.dealer === i ? '<span class="pkr-dealer" aria-label="Dealer">D</span>' : ''}
          <div class="pkr-seat-name">${presence}${esc(nameOf(i))}</div>
          <div class="pkr-seat-stack">${s.stack}</div></div>
        ${bs}${tag ? `<div class="pkr-seat-tag">${esc(tag)}</div>` : ''}
        ${handName ? `<div class="pkr-seat-hand">${esc(handName)}</div>` : ''}
      </div>`;
    }

    function wildText() {
      const hh = h();
      if (!hh || !hh.wild || !hh.wild.length) return '';
      if (vm.variant === 'ak47') return tr('akWild', 'A K 4 7 wild');
      return tr('wildIs', 'Wild') + ': ' + (RANK_PLURAL[hh.wild[0]] || '');
    }

    function resultHtml() {
      const hh = h();
      if (!hh || hh.phase !== 'done' || !hh.result) return '';
      const r = hh.result;
      const names = r.winners.map((i) => nameOf(i)).join(' & ');
      const how = { fold: tr('byFold', 'everyone else packed'), show: tr('byShow', 'at the show'), sideshow: tr('bySide', 'after the side show'), potlimit: tr('byPot', 'pot limit — all hands shown') }[r.reason] || '';
      return `<div class="tp-result"><b>${esc(names)}</b> ${esc(r.winners.length > 1 ? tr('split', 'split') : r.winners[0] === vm.me ? tr('take', 'take') : tr('takes', 'takes'))} ${r.pot}<br><small>${esc(how)}</small></div>`;
    }

    function paint() {
      if (destroyed || !vm) return;
      const hh = h();
      const n = vm.seats.length;
      const anchor = vm.me >= 0 ? vm.me : 0;
      host.querySelector('[data-seats]').innerHTML = vm.seats.map((s, i) => seatHtml(i, (i - anchor + n) % n, n)).join('');
      host.querySelector('[data-pot]').textContent = hh ? tr('pot', 'Pot') + ' ' + hh.pot + ' / ' + vm.potLimit : '';
      host.querySelector('[data-stake]').innerHTML = hh && hh.phase !== 'done' ? `${esc(tr('stake', 'Stake'))} ${hh.stake} · ${esc(tr('blindCost', 'blind'))} ${hh.stake} · ${esc(tr('seenCost', 'seen'))} ${hh.stake * 2}${wildText() ? `<br><span class="tp-wildline">${esc(wildText())}</span>` : ''}` : esc(wildText());
      host.querySelector('[data-result]').innerHTML = resultHtml();
      const status = host.querySelector('[data-status]');
      const hands = vm.over ? tr('tableOver', 'Table over') : tr('hand', 'Hand') + ' ' + (vm.handNo || 0) + '/' + vm.handsMax + ' · ' + tr('boot', 'boot') + ' ' + vm.boot;
      status.innerHTML = `${esc(hands + ' · ' + variantLabel(vm.variant))}${vm.live && !vm.over ? ' <span class="cl-timer pk-timer" data-timer></span>' : ''}${vm.live && vm.chip ? ` <span class="tp-chip">⚡${esc(tr('chipTable', 'chip table'))}</span>` : ''}`;
      if (o.onHud) o.onHud(status);
      paintHand();
      paintActions();
      paintFoot();
    }

    function paintHand() {
      const el = host.querySelector('[data-hand]');
      const hh = h();
      if (vm.me < 0 || !hh || !hh.dealt[vm.me]) {
        el.innerHTML = vm.me < 0 ? `<p class="pkr-wait">${esc(tr('watching', 'Watching'))}</p>` : '';
        return;
      }
      const inHand = hh.inHand[vm.me];
      const peekHtml = Object.keys(vm.peek || {})
        .map((k) => `<div class="tp-peek">${esc(tr('peekOf', 'Side show:'))} ${esc(nameOf(Number(k)))} ${cardsHtml(arr(vm.peek[k]), 'xs', { wild: hh.wild })}</div>`)
        .join('');
      if (vm.cards && vm.cards.length) {
        el.innerHTML = `<div class="tp-mine">${cardsHtml(vm.cards, 'lg', { wild: hh.wild, dim: !inHand })}</div>
          <div class="tp-handname">${esc(vm.handName || '')}${!inHand ? ' · ' + esc(tr('packed', 'Packed')) : ''}</div>${peekHtml}`;
      } else {
        el.innerHTML = `<div class="tp-mine">${cardHtml(null, 'lg') + cardHtml(null, 'lg') + cardHtml(null, 'lg')}</div>
          ${inHand && L().see ? `<button type="button" class="pk-btn pk-btn--ghost tp-see" data-see>${esc(tr('seeCards', 'See cards'))}</button><div class="tp-handname">${esc(tr('blindNote', 'Playing blind — seen bets cost double'))}</div>` : ''}${peekHtml}`;
        el.querySelector('[data-see]')?.addEventListener('click', () => send('see'));
      }
    }

    function paintActions() {
      const el = host.querySelector('[data-actions]');
      const hh = h();
      const l = L();
      const dis = pending ? 'disabled' : '';
      if (!hh || vm.over) {
        el.innerHTML = '';
        return;
      }
      if (l.back) {
        el.innerHTML = `<div class="pkr-bar"><button type="button" class="pkr-act pkr-act--primary" data-a="back" ${dis}>${esc(tr('back', 'I’m back'))}</button></div>`;
      } else if (l.respond) {
        const from = hh.side ? nameOf(hh.side.from) : '';
        el.innerHTML = `<div class="tp-ask">${esc(from)} ${esc(tr('asksSide', 'asks for a side show — compare hands privately; the lower hand packs.'))}</div>
          <div class="pkr-bar"><button type="button" class="pkr-act pkr-act--ghost" data-a="deny" ${dis}>${esc(tr('deny', 'Deny'))}</button>
          <button type="button" class="pkr-act pkr-act--primary" data-a="accept" ${dis}>${esc(tr('accept', 'Accept'))}</button></div>`;
      } else if (hh.phase === 'bet' && hh.turn === vm.me && l.pack) {
        const main = [`<button type="button" class="pkr-act pkr-act--fold" data-a="pack" ${dis}>${esc(tr('pack', 'Pack'))}</button>`];
        if (l.chaal) main.push(`<button type="button" class="pkr-act${l.raise ? '' : ' pkr-act--primary'}" data-a="chaal" ${dis}>${esc(l.chaal.blind ? tr('blindBet', 'Blind') : tr('chaal', 'Chaal'))} ${l.chaal.cost}</button>`);
        if (l.raise) main.push(`<button type="button" class="pkr-act pkr-act--primary" data-a="raise" ${dis}>${esc(tr('raise', 'Raise'))} ${l.raise.cost}</button>`);
        const extra = [];
        if (l.show) extra.push(`<button type="button" class="pk-chip" data-a="show" ${dis}>${esc(l.show.allIn ? tr('allInShow', 'All-in show') : tr('show', 'Show'))} ${l.show.cost}</button>`);
        if (l.sideshow) extra.push(`<button type="button" class="pk-chip" data-a="sideshow" ${dis}>${esc(tr('sideshow', 'Side show'))} ${l.sideshow.cost}</button>`);
        el.innerHTML = `<div class="pkr-bar">${main.join('')}</div>${extra.length ? `<div class="tp-extra">${extra.join('')}</div>` : ''}`;
      } else if (hh.phase === 'sideshow' && hh.side) {
        el.innerHTML = `<div class="pkr-wait">${esc(nameOf(hh.side.from))} ${esc(tr('askedSide', 'asked'))} ${esc(nameOf(hh.side.to))} ${esc(tr('forSide', 'for a side show…'))}</div>`;
      } else if (hh.phase === 'bet') {
        const who = hh.turn >= 0 ? nameOf(hh.turn) : '';
        el.innerHTML = `<div class="pkr-wait">${esc(who)} ${esc(tr('thinking', 'is thinking…'))}</div>${o.onSkip && vm.me >= 0 && !hh.inHand[vm.me] ? `<button type="button" class="pk-link" data-a="skip">${esc(tr('skip', 'Skip to the result'))}</button>` : ''}`;
      } else el.innerHTML = '';
      el.querySelectorAll('[data-a]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset.a;
          if (a === 'accept') send('respond', { accept: true });
          else if (a === 'deny') send('respond', { accept: false });
          else if (a === 'skip') o.onSkip && o.onSkip();
          else send(a);
        })
      );
    }

    function paintFoot() {
      const el = host.querySelector('[data-foot]');
      const hh = h();
      el.innerHTML = '';
      if (hh && hh.phase === 'done' && !vm.over) {
        const row = document.createElement('div');
        row.className = 'tp-next';
        row.innerHTML = o.onNext
          ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${esc(vm.handNo >= vm.handsMax ? tr('finish', 'See the standings') : tr('nextHand', 'Next hand'))}</button>`
          : `<div class="pkr-wait">${esc(tr('nextSoon', 'Next hand in a moment…'))}</div>`;
        el.appendChild(row);
        row.querySelector('[data-next]')?.addEventListener('click', () => o.onNext());
      }
      if (vm.over) {
        const ranks = (vm.ranking || []).map((i, k) => {
          const s = vm.seats[i];
          const d = s.stack - s.initial;
          return `<div class="tp-rank-row${i === vm.me ? ' is-me' : ''}"><span>${k + 1}. ${esc(nameOf(i))}</span><b>${s.stack}</b><span class="${d >= 0 ? 'is-up' : 'is-down'}">${d >= 0 ? '+' : ''}${d}</span></div>`;
        });
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
        vm = next;
        const hh = h();
        const key = hh && !vm.over && vm.me >= 0 && ((hh.phase === 'bet' && hh.turn === vm.me) || (hh.phase === 'sideshow' && hh.side && hh.side.to === vm.me)) ? vm.handNo + ':' + (vm.seq || 0) : '';
        if (key && !lastTurn) {
          fx('turn');
          if (vm.live && Kit() && typeof Kit().ding === 'function') Kit().ding();
        }
        lastTurn = key;
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
      },
    };
  }

  function buildVm(pubSt, priv, extra) {
    const p = priv || {};
    const seat = p.seat != null && p.seat >= 0 ? Number(p.seat) : -1;
    return Object.assign({}, pubSt, {
      me: seat,
      cards: p.cards ? arr(p.cards).filter(Boolean) : null,
      handName: p.name || '',
      peek: p.peek || {},
      legal: p.legal || {},
      seats: arr(pubSt.seats).filter(Boolean),
      ranking: arr(pubSt.ranking),
    }, extra || {});
  }

  const ERRORS = {
    not_your_turn: 'Not your turn',
    short: 'Not enough chips for that',
    cap: 'The stake is at the chaal limit',
    show_blind: 'You can’t ask a blind player for a show',
    show_two: 'Show is only for the last two players',
    no_sideshow: 'Side show needs the previous player to be seen',
  };

  // ---------------- practice vs bots (play chips, no wallet) ----------------

  function startLocal(opts) {
    const K = Kit();
    const C = Core();
    const s = Object.assign(loadSetup(), opts || {});
    const me = (K && K.myName()) || tr('you', 'You');
    const players = [{ id: 'me', name: me }];
    for (let i = 0; i < s.bots; i++) players.push({ id: 'bot' + (i + 1), name: tr('bot', 'Bot') + ' ' + (i + 1) + ' · ' + levelLabel(s.level), bot: true, level: s.level });
    const rng = CK().seededRng(CK().newSeed());
    const st = C.newMatch(players, { variant: s.variant, buyIn: 0, hands: s.hands, blindMax: s.blindMax, potX: s.potX }, rng);
    let timer = null;
    let recorded = false;
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: tr('practice', 'Practice') + ' · ' + variantLabel(s.variant) + ' · ' + tr('playChips', 'play chips'),
      confirmLeave: () => !st.over && st.handNo > 1,
      leaveBody: tr('leaveLocal', 'This table will end. Practice never touches your chips.'),
      onClose: () => {
        clearTimeout(timer);
        view.destroy();
      },
    });
    const host = shell.render('<div class="pk-page tp-page" data-tp></div>').querySelector('[data-tp]');

    function vmNow() {
      return buildVm(C.publicView(st), C.privateView(st, 0), { live: false });
    }
    function refresh() {
      view.update(vmNow());
      schedule();
    }
    function botStep() {
      const a0 = C.actor(st);
      if (a0 < 0 || !st.seats[a0].bot) return false;
      let guard = 0;
      let out;
      do {
        const a = C.botAction(st, a0, rng) || C.autoAction(st, a0);
        out = C.apply(st, a0, a);
        if (out.error) out = C.apply(st, a0, C.autoAction(st, a0));
      } while (!out.error && !st.over && C.actor(st) === a0 && st.hand.phase !== 'done' && guard++ < 3);
      return !out.error;
    }
    function schedule() {
      clearTimeout(timer);
      if (st.over || shell.closed) return;
      const a = C.actor(st);
      if (a < 0 || !st.seats[a].bot) return;
      timer = setTimeout(() => {
        if (shell.closed) return;
        botStep();
        const hh = st.hand;
        if (hh && hh.phase === 'done' && hh.result) fx(hh.result.winners.indexOf(0) >= 0 ? 'win' : 'place');
        refresh();
      }, CK().ms(900));
    }
    function act(type, args) {
      const out = C.apply(st, 0, Object.assign({ type }, args || {}));
      if (out.error) {
        fx('invalid');
        toast(ERRORS[out.error] || tr('notNow', 'Not now'));
        return out;
      }
      const hh = st.hand;
      if (hh && hh.phase === 'done' && hh.result) fx(hh.result.winners.indexOf(0) >= 0 ? 'win' : 'lose');
      else if (type !== 'see') fx('place');
      refresh();
      return out;
    }
    function onNext() {
      if (st.seats[0].stack < st.boot || st.handNo >= st.handsMax) C.endMatch(st);
      else C.nextHand(st, rng);
      refresh();
    }
    function skip() {
      clearTimeout(timer);
      let guard = 0;
      while (!st.over && st.hand && st.hand.phase !== 'done' && guard++ < 400) {
        const a = C.actor(st);
        if (a < 0 || !st.seats[a].bot) break;
        if (!botStep()) break;
      }
      refresh();
    }

    const view = createTable(host, {
      act,
      onNext,
      onSkip: skip,
      footer(vm, el) {
        if (!st.over) return;
        const won = st.winner === 0;
        if (!recorded) {
          recorded = true;
          fx(won ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { mode: 'practice', level: s.level, variant: s.variant });
        }
        const d = st.seats[0].stack - st.seats[0].initial;
        const line = (won ? tr('topTable', 'You finished on top') : tr('finished', 'You finished')) + ' · ' + (d >= 0 ? '+' : '') + d + ' ' + tr('playChips', 'play chips');
        el.innerHTML = `<div class="cl-result"><div class="rm-result-line">${esc(line)}</div>
          <p class="cl-note">${esc(tr('practiceNote', 'Practice uses play chips — your wallet is untouched.'))}</p>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'New table'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('change', 'Change table'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(s)));
        el.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
      },
      menu: () => [
        { label: tr('rules', 'Rules'), run: () => openRules(s.variant) },
        { label: tr('rankTitle', 'Hand rankings'), run: () => openRankings(s.variant) },
      ],
    });
    refresh();
  }

  function openRules(variant) {
    if (window.DangalRules && window.DangalRules.openSheet) window.DangalRules.openSheet(GAME, { variants: { variant: variant || 'classic' } });
  }

  function openLocalSheet(onGo) {
    const K = Kit();
    const s = loadSetup();
    K.openSheet({
      title: tr('setupTitle', 'Practice table'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('variant', 'Variant'))}</div>${K.segHtml('variant', s.variant, Core().VARIANTS.map((v) => [v, variantLabel(v)]))}
        <p class="cl-note" data-vnote>${esc(variantNote(s.variant))}</p>
        <div class="cl-sub">${esc(tr('botsN', 'Bots'))}</div>${K.segHtml('bots', s.bots, [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']])}
        <div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml('level', s.level, LEVELS.map((l) => [l, levelLabel(l)]))}
        <details class="cl-more"><summary>${esc(tr('more', 'More'))}</summary>
          <div class="cl-sub">${esc(tr('blindLimit', 'Blind limit'))}</div>${K.segHtml('blindMax', s.blindMax, [[2, '2'], [3, '3'], [4, '4'], [5, '5']])}
          <div class="cl-sub">${esc(tr('potLimit', 'Pot limit (× boot)'))}</div>${K.segHtml('potX', s.potX, [[25, '25'], [50, '50'], [100, '100']])}
          <div class="cl-sub">${esc(tr('handsN', 'Hands'))}</div>${K.segHtml('hands', s.hands, [[10, '10'], [20, '20'], [30, '30']])}
        </details>
        <p class="cl-note">${esc(tr('practiceNote', 'Practice uses play chips — your wallet is untouched.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('start', 'Start'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, s, () => (el.querySelector('[data-vnote]').textContent = variantNote(s.variant)));
        el.querySelector('[data-go]').addEventListener('click', () => {
          ['bots', 'blindMax', 'potX', 'hands'].forEach((k) => (s[k] = Number(s[k])));
          writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onGo(Object.assign({}, s)), 80);
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function roomSettings(ctrl) {
    return Object.assign({ variant: 'classic', buyIn: 0, hands: 10, blindMax: 4, potX: 50, bots: 0, botLevel: 'normal' }, (ctrl.view.pub && ctrl.view.pub.settings) || {});
  }
  function buyInLabel(s) {
    if (Number(s.bots) > 0 || !Number(s.buyIn)) return tr('playChipsTable', 'Play chips (no wallet)');
    return tr('buyIn', 'Buy-in') + ' ⚡' + s.buyIn;
  }
  function lobbySummary(ctrl) {
    const s = roomSettings(ctrl);
    const bits = [variantLabel(s.variant), buyInLabel(s), s.hands + ' ' + tr('handsWord', 'hands')];
    if (Number(s.bots) > 0) bits.push(s.bots + ' ' + (Number(s.bots) === 1 ? tr('botOne', 'bot') : tr('botMany', 'bots')));
    return bits.join(' · ') + ' · 18+';
  }
  function canStart(ctrl, players) {
    const s = roomSettings(ctrl);
    const total = players.length + (Number(s.bots) || 0);
    if (total < 3) return { ok: false, label: tr('needThree', 'Needs 3 players — invite friends or add bots') };
    if (total > 7) return { ok: false, label: tr('tooMany', 'Seats up to seven — fewer bots') };
    return { ok: true, label: tr('deal', 'Deal') };
  }
  function openRoomSettings(ctrl) {
    const K = Kit();
    const C = Core();
    const cur = roomSettings(ctrl);
    K.openSheet({
      title: tr('roomSettings', 'Table settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('variant', 'Variant'))}</div>${K.segHtml('variant', cur.variant, C.VARIANTS.map((v) => [v, variantLabel(v)]))}
        <p class="cl-note" data-vnote></p>
        <div class="cl-sub">${esc(tr('buyInT', 'Buy-in'))}</div>${K.segHtml('buyIn', cur.buyIn, C.BUYINS.map((n) => [n, n ? '⚡' + n : tr('playShort', 'Play chips')]))}
        <div class="cl-sub">${esc(tr('handsN', 'Hands'))}</div>${K.segHtml('hands', cur.hands, C.HANDS.map((n) => [n, String(n)]))}
        <div class="cl-sub">${esc(tr('botsN', 'Bots'))}</div>${K.segHtml('bots', cur.bots, [[0, tr('none0', 'None')], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']])}
        <div data-lvl><div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml('botLevel', cur.botLevel, LEVELS.map((l) => [l, levelLabel(l)]))}</div>
        <details class="cl-more"><summary>${esc(tr('more', 'More'))}</summary>
          <div class="cl-sub">${esc(tr('blindLimit', 'Blind limit'))}</div>${K.segHtml('blindMax', cur.blindMax, C.BLIND_MAX.map((n) => [n, String(n)]))}
          <div class="cl-sub">${esc(tr('potLimit', 'Pot limit (× boot)'))}</div>${K.segHtml('potX', cur.potX, C.POT_X.map((n) => [n, String(n)]))}
        </details>
        <p class="cl-note" data-note></p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        const paint = () => {
          el.querySelector('[data-vnote]').textContent = variantNote(cur.variant);
          el.querySelector('[data-lvl]').hidden = !(Number(cur.bots) > 0);
          el.querySelector('[data-note]').textContent =
            Number(cur.bots) > 0
              ? tr('botNote', 'Bots are labelled; with bots at the table everyone plays with play chips.')
              : Number(cur.buyIn)
                ? tr('chipNote', 'Each stack is the buy-in (or your balance if lower). After the last hand, everyone’s result is stack − buy-in. Virtual chips only — never bought or cashed out.')
                : tr('playNote', 'Play chips: 1000 each, nothing moves in your wallet.');
        };
        paint();
        K.wireSegs(el, cur, paint);
        el.querySelector('[data-save]').addEventListener('click', async () => {
          ['buyIn', 'hands', 'bots', 'blindMax', 'potX'].forEach((k) => (cur[k] = Number(cur[k]) || 0));
          const out = await ctrl.act('settings', { settings: cur });
          if (out) close();
        });
      },
    });
  }

  function hydratePub(raw) {
    const s = Core().hydrate(clone(raw || {}));
    s.bank = arr(s.bank);
    return s;
  }
  const LIVE_ERRORS = ['NOT_YOUR_TURN', 'PHASE', 'SHORT', 'CAP', 'SHOW_BLIND', 'SHOW_TWO', 'NO_SIDESHOW', 'NOT_IN_HAND', 'SEEN', 'OVER'];
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (LIVE_ERRORS.indexOf(code) >= 0 && e.message) return e.message;
    return Kit().roomErrorText(e);
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const sec = ctrl.view.secret;
    const secOk = sec && Number(sec.roundNo) === Number(pub.roundNo) && Number(sec.handNo) === Number(st.handNo);
    const fallbackSeat = st.seats.findIndex((x) => x.id === ctrl.uid && !x.bot);
    const vm = buildVm(st, secOk ? sec : { seat: fallbackSeat }, { live: true, chip: Number(st.chip) || 0, inBank: !!st.inBank });
    const mounted = ctrl.tp && ctrl.tp.round === pub.roundNo && ctrl.shell.el.contains(ctrl.tp.view.root);
    if (!mounted) {
      if (ctrl.tp) ctrl.tp.view.destroy();
      const host = ctrl.render('<div class="pk-page tp-page" data-tp></div>').querySelector('[data-tp]');
      const view = createTable(host, {
        live: true,
        act: (type, args) => ctrl.act(type, args),
        onHud: (el) => {
          if (ctrl.timer) ctrl.timer.stop();
          ctrl.timer = null;
          ctrl.wire(el);
        },
        footer: (v, el) => liveFooter(ctrl, v, el),
        menu: () => {
          const v = ctrl.tp && ctrl.tp.view.vm;
          const items = [
            { label: tr('rules', 'Rules'), run: () => openRules(v && v.variant) },
            { label: tr('rankTitle', 'Hand rankings'), run: () => openRankings(v && v.variant) },
          ];
          if (ctrl.isHost() && v && !v.over && v.hand && v.hand.phase === 'done') {
            items.push({ label: tr('endTable', 'End the table now'), run: () => ctrl.act('end_table') });
          }
          return items;
        },
      });
      ctrl.tp = { round: pub.roundNo, view };
      if (!ctrl.tpWrapped) {
        ctrl.tpWrapped = true;
        const close = ctrl.shell.close;
        ctrl.shell.close = function () {
          if (ctrl.tp) ctrl.tp.view.destroy();
          return close.apply(this, arguments);
        };
      }
    }
    ctrl.tp.view.update(vm);
  }

  function liveFooter(ctrl, vm, el) {
    if (!vm.over) return;
    const pub = ctrl.view.pub;
    const set = pub.settlement;
    const r = set && set.results && set.results[ctrl.uid];
    if (ctrl.tpFx !== pub.roundNo && vm.me >= 0) {
      ctrl.tpFx = pub.roundNo;
      const won = vm.winner === vm.me;
      fx(won ? 'win' : 'lose');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { live: true, variant: vm.variant });
    }
    const bits = [];
    if (r && r.chipDelta) bits.push(`<div class="cl-result-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta} ${esc(tr('chips', 'virtual chips'))}</div>`);
    else if (!vm.chip) bits.push(`<p class="cl-note">${esc(tr('noChipsMoved', 'Play chips — nothing moved in your wallet.'))}</p>`);
    if (set && set.status === 'pending') bits.push(`<div class="pkr-wait">${esc(tr('settling', 'Recording the result…'))}</div>`);
    el.innerHTML = `<div class="cl-result">${bits.join('')}
      ${Kit().roomResultActions(ctrl, { nextLabel: tr('newTable', 'New table'), waitLabel: tr('waitNew', 'Waiting for the host…') })}</div>`;
    Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, variantLabel(vm.variant) + ' ' + tr('tableDone', 'table done')) });
  }

  async function openRoom(code, opts) {
    const K = Kit();
    const o = opts || {};
    if (!(await adultOk())) return null;
    if (o.join) {
      if (!K.requireSignIn()) return null;
      try {
        const res = await K.roomCall(GAME, 'join', { code, name: K.myName() || 'Player' });
        if (res.pending) toast(tr('pendingJoin', 'Table in progress — you’ll be dealt in next table'));
      } catch (e) {
        toast(K.roomErrorText(e) || tr('joinFail', 'Couldn’t join that table'));
        return null;
      }
    }
    return K.openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: false,
      min: 1,
      max: 7,
      hydrate: hydratePub,
      lobbySummary,
      openSettings: openRoomSettings,
      canStart,
      errorText,
      renderPhase: renderLive,
      onLobbyMount(ctrl) {
        if (ctrl.tp) {
          ctrl.tp.view.destroy();
          ctrl.tp = null;
        }
      },
    });
  }

  async function createRoom(chat, settings) {
    if (!(await adultOk())) return;
    const s = Object.assign({ variant: loadSetup().variant, buyIn: 0, hands: 10, bots: 0 }, settings || {});
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: s, open: (code) => openRoom(code, {}) });
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Cards · 18+') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '♠'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Three cards. Bet blind or seen, call a show, or pack. Virtual chips only.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot"><span class="pk-mode-title">${esc(tr('vsBots', 'Practice vs bots'))}</span><span class="pk-mode-sub">${esc(variantLabel(s.variant) + ' · ' + s.bots + ' ' + tr('botMany', 'bots') + ' · ' + levelLabel(s.level) + ' · ' + tr('playChips', 'play chips'))}</span></button>
        <button type="button" class="pk-mode" data-go="friends"><span class="pk-mode-title">${esc(tr('friends', 'Play friends'))}</span><span class="pk-mode-sub">${esc(tr('friendsSub', 'Live table for 3–7 · bots can fill seats'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="change">${esc(tr('change', 'Change table'))}</button>
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a table code? Join'))}</button>
          <button type="button" class="pk-link" data-go="rankings">${esc(tr('rankTitle', 'Hand rankings'))}</button>
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
    b.querySelector('[data-go="rankings"]').addEventListener('click', () => openRankings(s.variant));
    b.querySelector('[data-go="rules"]').addEventListener('click', () => openRules(s.variant));
  }

  async function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Teen Patti is still loading — try again'));
    if (!c._ageOk && !(await adultOk())) return;
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
      id: 'teenpatti',
      name: 'Teen Patti',
      desc: 'Blind or seen · side show · bots · Live tables · 18+',
      icon: '♠',
      gameType: 'dual',
      genre: 'cards',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 34,
      meta: {
        core: 'teenpatti-core.js (rankings, variants, betting, bots — shared with the server)',
        live: 'party_room → server-lib/teenpatti-engine.js; server deal, cards only after you look, zero-sum chip ledger',
      },
      launch: openGame,
    });
  }

  window.TeenPattiGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal), _buildVm: buildVm };
  window.openTeenPatti = function (ctx) {
    openGame(Object.assign({ source: 'manch', mode: 'home' }, ctx || {}));
  };
})();
