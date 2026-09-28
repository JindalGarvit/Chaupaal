/**
 * Oh No! (Dangal P4) — our shedding card game. Rules based on the classic shedding card game,
 * original card art, declared house rules.
 * Play vs bots (Easy / Normal / Smart, 2–10 seats) · Play with friends (party room: server deal,
 * private hands in secrets/{uid}, server-checked plays, bots fill seats, optional stake).
 * One table renderer serves both: it gets a public view + my private view and sends actions.
 */
(function () {
  'use strict';

  const GAME = 'uno';
  const SETUP_KEY = 'chaupaal_ohno_setup';
  const ROOM_KEY = 'chaupaal_ohno_room';
  const PREFS_KEY = 'chaupaal_ohno_prefs';
  const Core = () => window.OhNoCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('ohno.' + key, fallback) : fallback;
  }
  const LABEL = 'Oh No!';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  // ---------------- prefs ----------------

  function prefs() {
    return Object.assign({ sort: true, symbols: false }, CK().readJson(PREFS_KEY, {}));
  }
  function setPref(k, v) {
    const p = prefs();
    p[k] = v;
    CK().writeJson(PREFS_KEY, p);
  }

  // ---------------- labels ----------------

  function colorLabel(c) {
    return { r: tr('red', 'Red'), y: tr('yellow', 'Yellow'), g: tr('green', 'Green'), b: tr('blue', 'Blue') }[c] || '';
  }
  function valueLabel(v) {
    return { S: tr('skip', 'Skip'), R: tr('reverse', 'Reverse'), D: tr('drawTwo', 'Draw Two'), W: tr('wild', 'Wild'), F: tr('wildFour', 'Wild Draw Four') }[v] || v;
  }
  function cardLabel(card) {
    const O = Core();
    if (O.isWild(card)) return valueLabel(card);
    return colorLabel(O.colorOf(card)) + ' ' + valueLabel(O.valueOf(card));
  }
  function roundWinLine(name, isMe) {
    return isMe ? tr('youWinRound', 'You win the round') : name + ' ' + tr('winsRound', 'wins the round');
  }
  function targetLabel(n) {
    return n ? tr('playTo', 'Play to') + ' ' + n : tr('singleRound', 'Single round');
  }
  const HOUSE = [
    ['stacking', 'Stacking', 'Draw Two on Draw Two, Draw Four on Draw Four'],
    ['stackMix', 'Stacking mix', 'Draw Two and Draw Four stack together (needs Stacking)'],
    ['jumpIn', 'Jump-In', 'Play an identical card out of turn'],
    ['sevenZero', '7-0', '7 swaps hands with a player you pick; 0 passes every hand along'],
    ['drawUntil', 'Draw until playable', 'Keep drawing until you get a card you can play'],
    ['forcePlay', 'Force play', 'A playable drawn card must be played'],
    ['noBluff', 'No bluffing', 'Draw Four is always legal and can’t be challenged'],
    ['quick', 'Quick round', 'Deal 5 cards instead of 7'],
  ];
  function houseRules(s) {
    return HOUSE.filter(([k]) => s[k]).map(([k, name]) => tr('house.' + k, name));
  }
  function houseRulesHtml(cur) {
    return `<div class="cl-prefs">${HOUSE.map(
      ([k, name, desc]) =>
        `<label class="cl-pref on-rule"><span><b>${esc(tr('house.' + k, name))}</b><small>${esc(tr('house.' + k + 'Desc', desc))}</small></span><input type="checkbox" data-rule="${k}" ${cur[k] ? 'checked' : ''}></label>`
    ).join('')}</div>`;
  }
  function wireHouseRules(el, cur) {
    el.querySelectorAll('[data-rule]').forEach((box) =>
      box.addEventListener('change', () => {
        cur[box.dataset.rule] = box.checked;
        if (box.dataset.rule === 'stackMix' && box.checked && !cur.stacking) {
          cur.stacking = true;
          const s = el.querySelector('[data-rule="stacking"]');
          if (s) s.checked = true;
        }
        if (box.dataset.rule === 'stacking' && !box.checked && cur.stackMix) {
          cur.stackMix = false;
          const m = el.querySelector('[data-rule="stackMix"]');
          if (m) m.checked = false;
        }
      })
    );
  }

  // ---------------- card art (original: framed face, corner indices, no oval) ----------------

  const GLYPH = { S: '⊘', R: '⇄', D: '+2', F: '+4', W: '' };
  function wheelHtml() {
    const O = Core();
    return `<span class="on-wheel" aria-hidden="true">${O.COLORS.map((c) => `<i style="background:${O.COLOR_HEX[c]}"></i>`).join('')}</span>`;
  }
  function shapeHtml(c, size) {
    const O = Core();
    return c ? CK().shapeSvg(O.COLOR_SHAPE[c], '#fff', size || 12) : '';
  }
  /** Card face. o: { playable, lift, jump, small, i, back, dim } */
  function cardHtml(card, o) {
    const O = Core();
    const opt = o || {};
    if (opt.back) return `<span class="on-card on-card--back${opt.small ? ' on-card--sm' : ''}" aria-hidden="true"><span class="on-back-mark">!</span></span>`;
    const wild = O.isWild(card);
    const c = O.colorOf(card);
    const v = O.valueOf(card);
    const face = wild ? (card === 'F' ? GLYPH.F : '') : GLYPH[v] || v;
    const corner = wild ? (card === 'F' ? '+4' : 'W') : GLYPH[v] || v;
    const sym = prefs().symbols && !wild ? `<span class="on-card-sym">${shapeHtml(c, opt.small ? 9 : 12)}</span>` : '';
    const cls = ['on-card', wild ? 'on-card--wild' : 'on-card--' + c, opt.small ? 'on-card--sm' : '', opt.playable ? 'is-playable' : '', opt.lift ? 'is-lift' : '', opt.jump ? 'is-jump' : '', opt.dim ? 'is-dim' : ''].filter(Boolean).join(' ');
    const tag = opt.i != null ? 'button' : 'span';
    const attrs = opt.i != null ? ` type="button" data-card="${esc(card)}" data-i="${opt.i}" aria-label="${esc(cardLabel(card) + (opt.playable ? ', ' + tr('playable', 'playable') : ''))}"` : ` aria-label="${esc(cardLabel(card))}"`;
    return `<${tag} class="${cls}"${attrs}${opt.style ? ` style="${opt.style}"` : ''}><span class="on-card-in"><span class="on-corner on-corner--tl">${esc(corner)}</span>${sym}<span class="on-face${face.length > 1 ? ' is-long' : ''}">${
      wild ? wheelHtml() + (face ? `<b>${esc(face)}</b>` : '') : esc(face)
    }</span><span class="on-corner on-corner--br">${esc(corner)}</span></span>${opt.jump ? `<span class="on-jump-tag">${esc(tr('jumpIn', 'Jump in!'))}</span>` : ''}</${tag}>`;
  }

  // ---------------- events → words + sounds ----------------

  function eventText(e, nameOf, me) {
    const n = (i) => nameOf(i);
    switch (e.type) {
      case 'play':
        return n(e.seat) + ' ' + tr('played', 'played') + ' ' + cardLabel(e.card) + (Core().isWild(e.card) ? ' → ' + colorLabel(e.color) : '');
      case 'draw':
        return e.forced ? n(e.seat) + ' ' + tr('draws', 'draws') + ' ' + e.n : n(e.seat) + ' ' + tr('drew', 'drew') + (e.n > 1 ? ' ' + e.n : ' ' + tr('aCard', 'a card'));
      case 'skip':
        return n(e.seat) + ' ' + tr('isSkipped', 'is skipped');
      case 'reverse':
        return tr('reversed', 'Direction reversed');
      case 'color':
        return n(e.seat) + ' ' + tr('picked', 'picked') + ' ' + colorLabel(e.color);
      case 'challenge':
        return n(e.seat) + ' ' + tr('challenged', 'challenged') + ' ' + n(e.target) + ' — ' + (e.guilty ? tr('bluffCaught', 'caught bluffing!') : tr('wasLegal', 'it was legal'));
      case 'ohno':
        return n(e.seat) + ': “' + tr('shout', 'Oh No!') + '”';
      case 'catch':
        return n(e.seat) + ' ' + tr('caught', 'caught') + ' ' + n(e.target) + '! +2';
      case 'jump':
        return n(e.seat) + ' ' + tr('jumpedIn', 'jumped in!');
      case 'swap':
        return n(e.seat) + ' ' + tr('swapped', 'swapped hands with') + ' ' + n(e.target);
      case 'rotate':
        return tr('rotated', 'Everyone passed their hand along');
      case 'reshuffle':
        return tr('reshuffled', 'Discards reshuffled into the draw pile');
      case 'pass':
        return n(e.seat) + ' ' + tr('kept', 'kept the card');
      case 'round_over':
        return roundWinLine(n(e.seat), e.seat === me) + ' · +' + e.points;
      case 'takeover':
        return n(e.seat) + ' ' + (e.reason === 'afk' ? tr('afkBot', 'is away — a bot takes over') : tr('leftBot', 'left — a bot takes over'));
      case 'round_start':
        return tr('round', 'Round') + ' ' + e.round;
      default:
        return '';
    }
  }
  const EVENT_FX = { play: 'place', draw: 'hop', catch: 'capture', ohno: 'home', challenge: 'slide', jump: 'climb', swap: 'slide', rotate: 'slide', skip: 'invalid' };

  // ---------------- the table ----------------

  /**
   * Mount a table in `host`. o = {
   *   live, send(action) → Promise<boolean>, deadline?() → ms epoch, wireTimer?(el),
   *   onRoundOver(el, pub, me), onOver(el, pub, me)
   * }
   * Call .update(pub, priv) with a public view (OhNoCore.publicView shape) and my private view.
   */
  function mountTable(host, o) {
    const O = Core();
    const ui = { pub: null, priv: null, me: -1, lastSeq: null, callNext: false, queue: [], ticking: null, busy: false, peekShownFor: null, round: null };

    function nameOf(i) {
      if (i === ui.me) return tr('you', 'You');
      const s = ui.pub && ui.pub.seats[i];
      return s ? s.name : '';
    }

    function playable(card) {
      const p = ui.pub;
      if (!p || ui.me < 0 || p.roundOver || p.over) return false;
      if (p.turn !== ui.me) return false;
      const fake = fakeState();
      return O.canPlay(fake, ui.me, card);
    }
    /** Enough state for OhNoCore.canPlay from the public + private views. */
    function fakeState() {
      const p = ui.pub;
      return {
        over: p.over,
        roundOver: p.roundOver,
        turn: p.turn,
        phase: p.phase,
        pending: p.pending,
        pendingKind: p.pendingKind,
        drawn: ui.priv ? ui.priv.drawn : null,
        settings: p.settings,
        color: p.color,
        discard: p.recent.slice(),
        seq: p.seq,
        seats: p.seats.map((s, i) => ({ hand: i === ui.me && ui.priv ? ui.priv.hand : [] })),
      };
    }
    function canJump(card) {
      const p = ui.pub;
      if (!p || ui.me < 0) return false;
      return O.canJumpIn(fakeState(), ui.me, card, p.seq);
    }

    function oppsHtml() {
      const p = ui.pub;
      const n = p.seats.length;
      const order = [];
      const start = ui.me >= 0 ? ui.me : -1;
      for (let k = 1; k <= n; k++) {
        const i = (((start + k) % n) + n) % n;
        if (i !== ui.me) order.push(i);
      }
      const compact = n > 6;
      const dl = o.deadline ? o.deadline() : 0;
      const left = dl ? Math.max(0, dl - Date.now()) : 0;
      return `<div class="on-opps${compact ? ' is-compact' : ''}">${order
        .map((i) => {
          const s = p.seats[i];
          const turn = !p.roundOver && !p.over && p.turn === i;
          const vulnerable = p.ohno && p.ohno.seat === i && !s.called && s.count === 1;
          const initial = esc((s.name || '?').trim().charAt(0).toUpperCase());
          return `<div class="on-opp${turn ? ' is-turn' : ''}${s.forfeit ? ' is-out' : ''}" data-seat="${i}">
            <span class="on-av">${s.bot ? '🤖' : initial}${turn && left ? `<svg class="on-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" style="animation-duration:${left}ms"/></svg>` : ''}</span>
            <span class="on-opp-name" title="${esc(s.name)}">${esc(compact && s.bot ? s.name.split(' · ')[0] : s.name)}</span>
            <span class="on-opp-meta"><span class="on-count" aria-label="${esc(s.count + ' ' + tr('cards', 'cards'))}">🂠 ${s.count}</span>${s.bot ? `<span class="cl-tag">${esc(tr('bot', 'Bot'))}</span>` : ''}${o.live && !s.bot ? `<span class="pk-dot" data-presence="${esc(s.id)}"></span>` : ''}</span>
            ${s.called && s.count === 1 ? `<span class="on-called">${esc(tr('shout', 'Oh No!'))}</span>` : ''}
            ${vulnerable && ui.me >= 0 ? `<button type="button" class="on-catch" data-catch="${i}">${esc(tr('catch', 'Catch!'))}</button>` : ''}
          </div>`;
        })
        .join('')}</div>`;
    }

    function statusText() {
      const p = ui.pub;
      if (p.over) return tr('matchOver', 'Match over');
      if (p.roundOver) {
        const w = p.lastRound ? p.lastRound.winner : p.turn;
        return roundWinLine(nameOf(w), w === ui.me);
      }
      const mine = p.turn === ui.me;
      if (p.phase === 'color') return mine ? tr('pickColour', 'Pick the starting colour') : nameOf(p.turn) + ' ' + tr('picksColour', 'is picking a colour');
      if (p.phase === 'challenge') {
        const by = p.wd4 ? p.wd4.by : -1;
        return mine ? nameOf(by) + ' ' + tr('playedFour', 'played Draw Four — challenge or draw') + ' ' + (p.pending || 4) : nameOf(p.turn) + ' ' + tr('decides', 'decides: challenge or draw');
      }
      if (p.pending > 0) return mine ? tr('stackOrDraw', 'Stack a draw card or draw') + ' ' + p.pending : nameOf(p.turn) + ' ' + tr('facesDraw', 'faces +') + p.pending;
      if (p.phase === 'drawn' && mine) return tr('playDrawn', 'Play the card you drew, or keep it');
      if (mine) return tr('yourTurn', 'Your turn');
      return nameOf(p.turn) + ' ' + tr('isPlaying', 'is playing…');
    }

    function handHtml() {
      const p = ui.pub;
      const hand = ui.priv ? ui.priv.hand.slice() : [];
      const shown = prefs().sort ? O.sortHand(hand) : hand;
      const n = shown.length;
      const avail = Math.min(window.innerWidth || 360, 520) - 24;
      const cw = 58;
      const step = n > 1 ? Math.min(cw + 4, Math.max(16, (avail - cw) / (n - 1))) : 0;
      const rot = n > 12 ? 1 : n > 7 ? 2 : 3;
      const drawnCard = ui.priv && ui.priv.drawn;
      let drawnMarked = false;
      const cards = shown
        .map((c, k) => {
          const isDrawn = drawnCard && c === drawnCard && !drawnMarked && p.phase === 'drawn' && p.turn === ui.me;
          if (isDrawn) drawnMarked = true;
          const can = playable(c);
          const jump = !can && canJump(c);
          const mid = (n - 1) / 2;
          const style = `margin-left:${k ? Math.round(step - cw) : 0}px;--rot:${((k - mid) * rot).toFixed(1)}deg;z-index:${k + 1}`;
          return cardHtml(c, { i: k, playable: can || jump, lift: can || jump, jump, style, dim: p.turn === ui.me && !can && !jump && !p.roundOver });
        })
        .join('');
      return `<div class="on-hand${n > 14 ? ' is-scroll' : ''}" data-hand role="group" aria-label="${esc(tr('yourHand', 'Your hand') + ' · ' + n)}">${cards}</div>`;
    }

    function actionsHtml() {
      const p = ui.pub;
      if (ui.me < 0 || p.roundOver || p.over) return '';
      const mine = p.turn === ui.me;
      const hand = ui.priv ? ui.priv.hand : [];
      const me = p.seats[ui.me];
      const out = [];
      const myWindow = p.ohno && p.ohno.seat === ui.me && hand.length === 1 && !me.called;
      if ((hand.length === 2 && !me.called) || myWindow) {
        const armed = ui.callNext && hand.length === 2;
        out.push(`<button type="button" class="on-ohno${armed ? ' is-armed' : ''}${myWindow ? ' is-urgent' : ''}" data-ohno>${esc(tr('shout', 'Oh No!'))}</button>`);
      }
      if (mine && p.phase === 'challenge') {
        out.push(`<button type="button" class="pk-btn pk-btn--primary" data-challenge>${esc(tr('challenge', 'Challenge'))}</button>`);
        out.push(`<button type="button" class="pk-btn pk-btn--ghost" data-accept>${esc(tr('drawN', 'Draw') + ' ' + (p.pending || 4))}</button>`);
      } else if (mine && p.pending > 0 && p.phase === 'play') {
        out.push(`<button type="button" class="pk-btn pk-btn--ghost" data-draw>${esc(tr('drawN', 'Draw') + ' ' + p.pending)}</button>`);
      } else if (mine && p.phase === 'drawn' && !p.settings.forcePlay) {
        out.push(`<button type="button" class="pk-btn pk-btn--ghost" data-pass>${esc(tr('keep', 'Keep it'))}</button>`);
      }
      return out.join('');
    }

    function peekHtml() {
      const pk = ui.priv && ui.priv.peek;
      if (!pk) return '';
      return `<div class="on-peek" role="status"><div class="on-peek-title">${esc(tr('peekTitle', 'You saw') + ' ' + nameOf(pk.seat) + tr('peekHand', '’s hand'))}</div><div class="on-peek-cards">${(pk.hand || [])
        .map((c) => cardHtml(c, { small: true }))
        .join('')}</div></div>`;
    }

    function centerHtml() {
      const p = ui.pub;
      const top = p.recent[p.recent.length - 1];
      const under = p.recent.slice(-3, -1);
      const canDraw = ui.me >= 0 && p.turn === ui.me && p.phase === 'play' && !p.roundOver && !p.over;
      const col = p.color ? O.COLOR_HEX[p.color] : '#888';
      return `<div class="on-center">
        <button type="button" class="on-pile${canDraw ? ' is-ready' : ''}" data-drawpile ${canDraw ? '' : 'disabled'} aria-label="${esc(tr('drawPile', 'Draw pile') + ' · ' + p.drawCount)}">
          ${cardHtml(null, { back: true })}<span class="on-pile-n">${p.drawCount}</span>${canDraw && !(p.pending > 0) ? `<span class="on-pile-cta">${esc(tr('draw', 'Draw'))}</span>` : ''}
        </button>
        <div class="on-discard" data-discard style="--cur:${col}">
          ${under.map((c, k) => `<span class="on-under" style="--k:${k}">${cardHtml(c)}</span>`).join('')}
          <span class="on-top" data-top>${top ? cardHtml(top) : ''}</span>
        </div>
        <div class="on-state">
          <span class="on-dir" aria-label="${esc(p.dir === 1 ? tr('clockwise', 'Clockwise') : tr('anticlockwise', 'Anticlockwise'))}">${p.dir === 1 ? '↻' : '↺'}</span>
          <span class="on-colour" style="background:${col}">${p.color ? shapeHtml(p.color, 12) : ''}<span>${esc(colorLabel(p.color))}</span></span>
          ${p.pending > 0 ? `<span class="on-pending">+${p.pending}</span>` : ''}
        </div>
      </div>`;
    }

    function paint() {
      const p = ui.pub;
      if (!p) return;
      const mine = !p.roundOver && !p.over && p.turn === ui.me;
      const houses = houseRules(p.settings);
      host.innerHTML = `<div class="on-table${p.seats.length > 6 ? ' is-crowded' : ''}">
        <div class="on-top-row"><span class="on-round">${esc(tr('round', 'Round') + ' ' + p.round + ' · ' + targetLabel(p.settings.target))}</span>${
          houses.length ? `<button type="button" class="pk-link on-house-link" data-house>${esc(tr('houseRules', 'House rules') + ' · ' + houses.length)}</button>` : ''
        }</div>
        ${oppsHtml()}
        ${centerHtml()}
        <div class="cl-banner on-banner" role="status" aria-live="polite" data-tone="${mine ? 'you' : ''}"><span data-status>${esc(statusText())}</span>${o.live && !p.over ? ' <span class="cl-timer pk-timer" data-timer></span>' : ''}</div>
        <div class="on-ticker" data-ticker aria-live="polite"></div>
        ${peekHtml()}
        <div class="on-actions">${actionsHtml()}</div>
        ${ui.me < 0 ? `<p class="cl-note">${esc(tr('watching', 'You’re watching this game'))}</p>` : p.roundOver || p.over ? '' : handHtml()}
        <div class="on-me-row">${ui.me >= 0 ? `<span class="on-me-score">${esc(tr('you', 'You'))} · ${p.scores[ui.me] || 0} ${esc(tr('pts', 'pts'))}</span>` : ''}
          <button type="button" class="pk-link" data-sort>${esc(prefs().sort ? tr('sorted', 'Sorted') : tr('unsorted', 'As dealt'))}</button>
          <button type="button" class="pk-link" data-symbols>${esc(prefs().symbols ? tr('symbolsOn', 'Symbols on') : tr('symbols', 'Colour-blind symbols'))}</button>
          <button type="button" class="pk-link" data-prefs>${esc(tr('settings', 'Sound'))}</button>
        </div>
        <div class="cl-controls on-controls" data-controls></div>
      </div>`;
      wire();
      if (o.wireTimer) o.wireTimer(host);
      const ctl = host.querySelector('[data-controls]');
      if (p.over) o.onOver && o.onOver(ctl, p, ui.me);
      else if (p.roundOver) o.onRoundOver && o.onRoundOver(ctl, p, ui.me);
      else ctl.remove();
    }

    async function send(a) {
      if (ui.busy) return false;
      ui.busy = true;
      try {
        const ok = await o.send(a);
        if (!ok) CK().fx('invalid');
        return ok;
      } finally {
        ui.busy = false;
      }
    }

    function pickColour(onPick) {
      Kit().openSheet({
        title: tr('pickColourTitle', 'Pick a colour'),
        bodyHtml: `<div class="on-colours">${O.COLORS.map(
          (c) => `<button type="button" class="on-colour-btn" data-colour="${c}" style="background:${O.COLOR_HEX[c]}">${shapeHtml(c, 18)}<span>${esc(colorLabel(c))}</span></button>`
        ).join('')}</div>`,
        onMount(el, close) {
          el.querySelectorAll('[data-colour]').forEach((b) =>
            b.addEventListener('click', () => {
              close();
              onPick(b.dataset.colour);
            })
          );
        },
      });
    }
    function pickPlayer(onPick) {
      const p = ui.pub;
      Kit().openSheet({
        title: tr('swapWith', 'Swap hands with…'),
        bodyHtml: `<div class="on-targets">${p.seats
          .map((s, i) => (i === ui.me ? '' : `<button type="button" class="pk-row-btn" data-target="${i}">${esc(s.name)} · ${s.count} ${esc(tr('cards', 'cards'))}</button>`))
          .join('')}</div>`,
        onMount(el, close) {
          el.querySelectorAll('[data-target]').forEach((b) =>
            b.addEventListener('click', () => {
              close();
              onPick(Number(b.dataset.target));
            })
          );
        },
      });
    }

    function playCard(card) {
      const p = ui.pub;
      const jump = p.turn !== ui.me;
      const base = { type: 'play', card };
      if (jump) base.seq = p.seq;
      if (ui.callNext && ui.priv.hand.length === 2) base.call = true;
      const needTarget = p.settings.sevenZero && O.valueOf(card) === '7' && p.seats.length > 2;
      const go = (a) => {
        CK().fx('place');
        send(a).then((ok) => {
          if (ok) ui.callNext = false;
        });
      };
      const withTarget = (a) => (needTarget ? pickPlayer((target) => go(Object.assign(a, { target }))) : go(a));
      if (O.isWild(card)) pickColour((color) => withTarget(Object.assign(base, { color })));
      else withTarget(base);
    }

    function wire() {
      const p = ui.pub;
      host.querySelectorAll('[data-card]').forEach((btn) => {
        const card = btn.dataset.card;
        let sy = null;
        let moved = false;
        btn.addEventListener('pointerdown', (e) => {
          sy = e.clientY;
          moved = false;
        });
        btn.addEventListener('pointermove', (e) => {
          if (sy == null) return;
          const dy = e.clientY - sy;
          if (dy < -8) {
            moved = true;
            btn.style.transform = `translateY(${Math.max(-90, dy)}px)`;
          }
        });
        const end = (e) => {
          if (sy == null) return;
          const dy = e.clientY - sy;
          sy = null;
          btn.style.transform = '';
          if (moved && dy < -50) {
            moved = 'played';
            if (btn.classList.contains('is-playable')) playCard(card);
            else CK().fx('invalid');
          }
        };
        btn.addEventListener('pointerup', end);
        btn.addEventListener('pointercancel', () => {
          sy = null;
          btn.style.transform = '';
        });
        btn.addEventListener('click', () => {
          if (moved) return;
          if (btn.classList.contains('is-playable')) playCard(card);
          else {
            btn.classList.remove('is-shake');
            void btn.offsetWidth;
            btn.classList.add('is-shake');
            CK().fx('invalid');
          }
        });
      });
      host.querySelector('[data-drawpile]')?.addEventListener('click', () => {
        CK().fx('hop');
        send({ type: 'draw' });
      });
      host.querySelector('[data-draw]')?.addEventListener('click', () => send({ type: 'draw' }));
      host.querySelector('[data-pass]')?.addEventListener('click', () => send({ type: 'pass' }));
      host.querySelector('[data-accept]')?.addEventListener('click', () => send({ type: 'accept' }));
      host.querySelector('[data-challenge]')?.addEventListener('click', () => send({ type: 'challenge' }));
      host.querySelector('[data-ohno]')?.addEventListener('click', () => {
        const hand = ui.priv ? ui.priv.hand : [];
        CK().fx('home');
        if (hand.length === 1 || (p.turn === ui.me && p.phase !== 'color' && O.legalCards(fakeState(), ui.me).length)) send({ type: 'ohno' });
        else {
          ui.callNext = true;
          paint();
          toast(tr('armed', '“Oh No!” will be called with your next card'));
        }
      });
      host.querySelectorAll('[data-catch]').forEach((b) =>
        b.addEventListener('click', () => {
          CK().fx('capture');
          send({ type: 'catch', target: Number(b.dataset.catch) });
        })
      );
      host.querySelector('[data-sort]')?.addEventListener('click', () => {
        setPref('sort', !prefs().sort);
        paint();
      });
      host.querySelector('[data-symbols]')?.addEventListener('click', () => {
        setPref('symbols', !prefs().symbols);
        paint();
      });
      host.querySelector('[data-prefs]')?.addEventListener('click', () => CK().openPrefsSheet(['sound', 'haptics', 'speed']));
      host.querySelector('[data-house]')?.addEventListener('click', () => {
        Kit().openSheet({
          title: tr('houseRulesInGame', 'House rules in this game'),
          bodyHtml: `<ul class="on-house-list">${HOUSE.filter(([k]) => p.settings[k])
            .map(([k, name, desc]) => `<li><b>${esc(tr('house.' + k, name))}</b> — ${esc(tr('house.' + k + 'Desc', desc))}</li>`)
            .join('')}</ul>`,
        });
      });
      if (p.phase === 'color' && p.turn === ui.me && !p.roundOver) setTimeout(() => pickColour((color) => send({ type: 'color', color })), 60);
    }

    /** New events since the last paint: sounds + a short ticker; the discard flips through played cards. */
    function playEvents(events) {
      if (!events.length) return;
      const lines = events.map((e) => eventText(e, nameOf, ui.me)).filter(Boolean);
      const plays = events.filter((e) => e.type === 'play');
      const ticker = host.querySelector('[data-ticker]');
      const topEl = host.querySelector('[data-top]');
      clearTimeout(ui.ticking);
      const step = CK().ms(plays.length > 1 ? 420 : 0);
      let k = 0;
      const show = () => {
        if (!host.isConnected) return;
        const e = events[k];
        if (!e) {
          if (topEl && ui.pub) topEl.innerHTML = cardHtml(ui.pub.recent[ui.pub.recent.length - 1]);
          if (topEl) topEl.classList.remove('is-new');
          return;
        }
        const text = eventText(e, nameOf, ui.me);
        if (ticker && text) ticker.textContent = text;
        if (EVENT_FX[e.type] && (e.seat !== ui.me || e.type === 'draw')) CK().fx(EVENT_FX[e.type]);
        if (e.type === 'play' && topEl) {
          topEl.innerHTML = cardHtml(e.card);
          topEl.classList.remove('is-new');
          void topEl.offsetWidth;
          topEl.classList.add('is-new');
        }
        k++;
        if (step && k < events.length) ui.ticking = setTimeout(show, e.type === 'play' ? step : Math.round(step / 2));
        else {
          if (ticker) ticker.textContent = lines.slice(-2).join(' · ');
          if (topEl && ui.pub) {
            const last = ui.pub.recent[ui.pub.recent.length - 1];
            if (plays.length > 1) topEl.innerHTML = cardHtml(last);
          }
        }
      };
      show();
    }

    return {
      update(pub, priv, me) {
        const prevSeq = ui.lastSeq;
        const prevRound = ui.round;
        const wasMyTurn = ui.pub && ui.pub.turn === ui.me && !ui.pub.roundOver;
        ui.pub = pub;
        ui.priv = priv || { hand: [], drawn: null, peek: null };
        ui.me = me;
        ui.round = pub.round;
        if (ui.priv.hand.length !== 2) ui.callNext = false;
        paint();
        const events = prevSeq == null ? [] : (pub.log || []).filter((e) => e.seq > prevSeq && (prevRound === pub.round || e.type !== 'round_start'));
        ui.lastSeq = pub.seq;
        playEvents(events);
        const myTurn = pub.turn === me && !pub.roundOver && !pub.over;
        if (myTurn && !wasMyTurn && prevSeq != null) CK().fx('turn');
      },
      repaint: paint,
    };
  }

  // ---------------- end screens ----------------

  function roundSummaryHtml(p, me) {
    const lr = p.lastRound;
    if (!lr) return '';
    const name = (i) => (i === me ? tr('you', 'You') : p.seats[i].name);
    const rows = p.seats
      .map((s, i) => i)
      .sort((a, b) => (a === lr.winner ? -1 : b === lr.winner ? 1 : lr.handPoints[a] - lr.handPoints[b]))
      .map(
        (i) => `<div class="cl-rank-row${i === lr.winner ? ' is-first' : ''}"><span class="cl-rank-name">${esc(name(i))}</span><span class="on-left-cards">${(lr.hands[i] || [])
          .slice(0, 8)
          .map((c) => cardHtml(c, { small: true }))
          .join('')}${(lr.hands[i] || []).length > 8 ? '…' : ''}</span><span class="on-pts">${i === lr.winner ? '+' + lr.points : lr.handPoints[i]}</span></div>`
      )
      .join('');
    return `<div class="cl-section">${esc(roundWinLine(name(lr.winner), lr.winner === me) + ' · +' + lr.points)}</div><div class="cl-ranking">${rows}</div>`;
  }
  function leaderboardHtml(p, me, chip) {
    const order = p.ranking && p.over ? p.ranking : p.seats.map((s, i) => i).sort((a, b) => p.scores[b] - p.scores[a]);
    return `<div class="cl-sub">${esc(p.over ? tr('final', 'Final standings') : tr('leaderboard', 'Match · ') + targetLabel(p.settings.target))}</div><div class="cl-ranking">${order
      .map(
        (i, k) => `<div class="cl-rank-row${k === 0 ? ' is-first' : ''}"><span class="cl-rank-place">${esc(CK().placeLabel(k + 1))}</span><span class="cl-rank-name">${esc(i === me ? tr('you', 'You') : p.seats[i].name)}${p.seats[i].bot ? ' 🤖' : ''}${
          p.seats[i].forfeit ? ' · ' + esc(tr('left', 'left')) : ''
        }</span><span class="on-pts">${p.scores[i]}</span>${chip ? chip(p.seats[i]) : ''}</div>`
      )
      .join('')}</div>`;
  }
  function shareText(p, me) {
    const win = p.ranking ? p.ranking[0] : p.lastRound ? p.lastRound.winner : -1;
    const who = win === me ? tr('iWon', 'I won') : (p.seats[win] ? p.seats[win].name : '') + ' ' + tr('won', 'won');
    return who + ' ' + LABEL + ' · ' + (p.scores[win] || 0) + ' ' + tr('pts', 'pts') + ' · ' + p.seats.length + ' ' + tr('players', 'players');
  }

  // ---------------- local (vs bots) ----------------

  function loadSetup() {
    return Object.assign({ players: 4, level: 'normal', style: 'honest' }, Core().DEFAULTS, CK().readJson(SETUP_KEY, {}));
  }

  function startLocal(opts) {
    const K = Kit();
    const O = Core();
    const C = CK();
    const set = Object.assign(loadSetup(), opts || {});
    const n = Math.max(2, Math.min(10, Number(set.players) || 4));
    const rng = C.seededRng(C.newSeed());
    const me = { id: 'me', name: (K && K.myName()) || tr('you', 'You') };
    const players = [me];
    for (let i = 1; i < n; i++) players.push({ id: 'bot' + i, name: tr('bot', 'Bot') + ' ' + i + ' · ' + C.levelLabel(set.level), bot: true, level: set.level, persona: set.style });
    const st = O.newMatch(players, O.mergeSettings(set), rng);
    const style = set.style === 'bluffer' ? { bluff: 0.6 } : { bluff: 0 };
    let timer = null;
    let recorded = false;
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: C.levelLabel(set.level) + ' · ' + n + ' ' + tr('players', 'players'),
      confirmLeave: () => !st.over && (st.round > 1 || st.seq > 2),
      leaveBody: tr('leaveLocal', 'This match will end.'),
      onClose: () => clearTimeout(timer),
    });
    const body = shell.render('<div class="pk-page on-game" data-table></div>');
    const table = mountTable(body.querySelector('[data-table]'), {
      live: false,
      send: async (a) => {
        const out = O.apply(st, 0, a, { rng, now: Date.now() });
        if (out.error) {
          if (out.error === 'too_late') toast(tr('tooLate', 'Too late!'));
          return false;
        }
        refresh();
        return true;
      },
      onRoundOver(el, p) {
        el.innerHTML = `<div class="cl-result">${roundSummaryHtml(p, 0)}${leaderboardHtml(p, 0)}<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${esc(tr('nextRound', 'Next round'))}</button></div>`;
        el.querySelector('[data-next]').addEventListener('click', () => {
          O.nextRound(st, rng);
          refresh();
        });
      },
      onOver(el, p) {
        if (!recorded) {
          recorded = true;
          const won = p.ranking[0] === 0;
          C.fx(won ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, won);
        }
        el.innerHTML = `<div class="cl-result"><div class="cl-result-title">${esc(p.ranking[0] === 0 ? tr('youWin', 'You win!') : p.seats[p.ranking[0]].name + ' ' + tr('wins', 'wins!'))}</div>${roundSummaryHtml(p, 0)}${leaderboardHtml(p, 0)}
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-share>${esc(tr('share', 'Share'))}</button><button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('change', 'Change setup'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(set)));
        el.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
        el.querySelector('[data-share]').addEventListener('click', () => C.shareWin(GAME, LABEL, shareText(p, 0) + ' · vs ' + C.levelLabel(set.level) + ' ' + tr('bots', 'bots')));
      },
    });
    function refresh() {
      if (shell.closed) return;
      table.update(O.publicView(st), O.privateView(st, 0), 0);
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      if (st.over || st.roundOver) return;
      const seat = st.seats[st.turn];
      if (!seat.bot) {
        // A bot forgot "Oh No!" and it's my turn: I can still catch until I act.
        return;
      }
      const botForgot = st.ohno && st.ohno.seat !== st.turn && st.seats[st.ohno.seat].bot;
      timer = setTimeout(() => {
        if (shell.closed || st.over || st.roundOver) return;
        const t = st.turn;
        if (!st.seats[t].bot) return refresh();
        const now = Date.now();
        if (st.ohno && st.ohno.seat !== t && O.botWouldCatch(st, st.seats[t].level, rng)) O.apply(st, t, { type: 'catch', target: st.ohno.seat }, { rng, now });
        let out = O.apply(st, t, O.botAction(st, t, rng, { style }), { rng, now });
        if (out.error) out = O.apply(st, t, O.autoAction(st, t), { rng, now });
        refresh();
      }, C.ms(botForgot ? 1800 : st.phase === 'drawn' ? 450 : 750));
    }
    refresh();
  }

  function openLocalSheet(onGo) {
    const K = Kit();
    const s = loadSetup();
    K.openSheet({
      title: tr('botTitle', 'Play vs bots'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('seats', 'Players (you + bots)'))}</div>
        <div class="on-stepper"><button type="button" class="pk-btn pk-btn--ghost" data-step="-1" aria-label="${esc(tr('fewer', 'Fewer'))}">−</button><span data-n>${s.players}</span><button type="button" class="pk-btn pk-btn--ghost" data-step="1" aria-label="${esc(tr('more', 'More'))}">+</button></div>
        <div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>
        ${K.segHtml('level', s.level, Core().LEVELS.map((l) => [l, CK().levelLabel(l)]))}
        <div class="cl-sub">${esc(tr('match', 'Match'))}</div>
        ${K.segHtml('target', s.target, Core().TARGETS.map((n) => [n, n ? String(n) : tr('oneRound', '1 round')]))}
        <details class="cl-advanced"><summary>${esc(tr('more', 'More options'))}</summary>
          <div class="cl-sub">${esc(tr('botStyle', 'Bot style'))}</div>
          ${K.segHtml('style', s.style, [['honest', tr('honest', 'Honest')], ['bluffer', tr('bluffer', 'Bluffer')]])}
          <p class="cl-note">${esc(tr('bluffNote', 'Bluffer bots sometimes play Draw Four illegally — challenge them.'))}</p>
          <div class="cl-sub">${esc(tr('houseRules', 'House rules'))}</div>
          ${houseRulesHtml(s)}
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('start', 'Start'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, s, () => {});
        wireHouseRules(el, s);
        el.querySelectorAll('[data-step]').forEach((b) =>
          b.addEventListener('click', () => {
            s.players = Math.max(2, Math.min(10, s.players + Number(b.dataset.step)));
            el.querySelector('[data-n]').textContent = s.players;
          })
        );
        el.querySelector('[data-go]').addEventListener('click', () => {
          CK().writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onGo(Object.assign({}, s)), 80);
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function roomDefaults() {
    return Object.assign({ bots: 0, botLevel: 'normal', botStyle: 'honest', stake: 0 }, Core().DEFAULTS, CK().readJson(ROOM_KEY, {}));
  }
  function lobbySummary(ctrl) {
    const s = Core().mergeSettings((ctrl.view.pub && ctrl.view.pub.settings) || {});
    const raw = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const bits = [targetLabel(s.target)];
    if (raw.bots) bits.push(raw.bots + ' ' + (raw.bots === 1 ? tr('botOne', 'bot') : tr('bots', 'bots')) + ' · ' + CK().levelLabel(raw.botLevel || 'normal'));
    bits.push(CK().stakeLabel(Number(raw.stake) || 0));
    return bits.join(' · ');
  }
  function openRoomSettings(ctrl) {
    const K = Kit();
    const cur = Object.assign({}, roomDefaults(), (ctrl.view.pub && ctrl.view.pub.settings) || {});
    const humans = ctrl.players().length;
    const botOpts = [];
    for (let b = 0; b + humans <= 10 && b <= 9; b++) botOpts.push([b, String(b)]);
    K.openSheet({
      title: tr('roomSettings', 'Room settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('match', 'Match'))}</div>
        ${K.segHtml('target', cur.target, Core().TARGETS.map((n) => [n, n ? String(n) : tr('oneRound', '1 round')]))}
        <div class="cl-sub">${esc(tr('fillBots', 'Fill empty seats with bots'))}</div>
        <div class="on-seg-scroll">${K.segHtml('bots', Math.min(cur.bots, botOpts.length - 1), botOpts)}</div>
        ${K.segHtml('botLevel', cur.botLevel, Core().LEVELS.map((l) => [l, CK().levelLabel(l)]))}
        <div class="cl-sub">${esc(tr('stake', 'Stake'))}</div>
        ${K.segHtml('stake', cur.stake, CK().STAKES.map((n) => [n, n ? '⚡' + n : tr('friendly', 'Friendly')]))}
        <p class="cl-note">${esc(tr('payouts', 'Everyone antes the stake; placement by match score. 2 players: winner takes both · 3: 70/30 · 4: 60/30/10 · 5+: 50/30/20. Bots never take chips. Virtual chips only.'))}</p>
        <details class="cl-advanced"><summary>${esc(tr('houseRules', 'House rules'))}</summary>
          ${houseRulesHtml(cur)}
          <div class="cl-sub">${esc(tr('botStyle', 'Bot style'))}</div>
          ${K.segHtml('botStyle', cur.botStyle, [['honest', tr('honest', 'Honest')], ['bluffer', tr('bluffer', 'Bluffer')]])}
        </details>
        <p class="cl-note">${esc(tr('lockedAtStart', 'House rules lock when the game starts and show for everyone.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        wireHouseRules(el, cur);
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const next = Object.assign({}, cur, { bots: Number(cur.bots), stake: Number(cur.stake), target: Number(cur.target) });
          CK().writeJson(ROOM_KEY, next);
          const out = await ctrl.act('settings', { settings: next });
          if (out) close();
        });
      },
    });
  }
  function lobbyListHtml(ctrl, players) {
    const pub = ctrl.view.pub;
    const s = pub.settings || {};
    const bots = Math.max(0, Math.min(Number(s.bots) || 0, 10 - players.length));
    const rows = players.map(
      (p) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${p.id === pub.host ? '<span class="pk-badge">Host</span>' : ''}${
        p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">You</span>' : ''
      }</div>`
    );
    for (let i = 0; i < bots; i++) rows.push(`<div class="pk-lobby-row is-bot"><span class="pk-dot is-online"></span><span>🤖 ${esc(tr('bot', 'Bot') + ' ' + (i + 1) + ' · ' + CK().levelLabel(s.botLevel || 'normal'))}</span></div>`);
    const house = houseRules(Core().mergeSettings(s));
    return `<div class="pk-lobby-list">${rows.join('')}</div><div class="cl-house"><div class="cl-sub">${esc(tr('houseRulesInGame', 'House rules in this game'))}</div>${
      house.length ? `<ul>${house.map((h) => '<li>' + esc(h) + '</li>').join('')}</ul>` : `<p class="cl-note">${esc(tr('standardOnly', 'None — standard rules'))}</p>`
    }</div>`;
  }
  function canStart(ctrl, players) {
    const s = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const total = players.length + Math.max(0, Math.min(Number(s.bots) || 0, 10 - players.length));
    if (total < 2) return { ok: false, label: tr('addBotOrFriend', 'Add a bot or invite a friend') };
    return { ok: true, label: tr('start', 'Start') + ' · ' + total + ' ' + tr('players', 'players') };
  }
  const ERR = {
    NOT_YOUR_TURN: 'Wait for your turn',
    ILLEGAL_CARD: 'That card doesn’t match',
    TOO_LATE: 'Too late!',
    PICK_COLOR: 'Pick a colour',
    PICK_PLAYER: 'Pick a player',
    MUST_PLAY: 'House rule: you must play the card you drew',
    CANT_CALL: 'Call “Oh No!” when you’re down to two cards',
    PHASE: 'Not right now',
    ROUND_OVER: 'The round is over',
    NOT_IN_HAND: 'That card isn’t in your hand any more',
  };
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (ERR[code]) return tr('err.' + code.toLowerCase(), ERR[code]);
    return Kit().roomErrorText ? Kit().roomErrorText(e) : e && e.message;
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const me = st.seats.findIndex((s) => s.id === ctrl.uid && !s.forfeit);
    const secret = ctrl.view.secret && Number(ctrl.view.secret.roundNo) === Number(pub.roundNo) && Number(ctrl.view.secret.round) === st.round ? ctrl.view.secret : null;
    const priv = secret ? { hand: Array.isArray(secret.hand) ? secret.hand : Object.values(secret.hand || {}), drawn: secret.drawn || null, peek: secret.peek ? { seat: secret.peek.seat, hand: Object.values(secret.peek.hand || {}) } : null } : { hand: [], drawn: null, peek: null };
    let mount = ctrl.ohno;
    if (!mount || mount.roundNo !== pub.roundNo || !ctrl.shell.body.querySelector('.on-table')) {
      const body = ctrl.render('<div class="pk-page on-game" data-table></div>');
      const table = mountTable(body.querySelector('[data-table]'), {
        live: true,
        send: async (a) => {
          const args = Object.assign({}, a);
          delete args.type;
          const out = await ctrl.act(a.type, args);
          return !!out;
        },
        deadline: () => (ctrl.conn ? ctrl.conn.localDeadline() : 0),
        wireTimer: (el) => ctrl.wire(el),
        onRoundOver(el, p, meIdx) {
          const host = ctrl.isHost();
          el.innerHTML = `<div class="cl-result">${roundSummaryHtml(p, meIdx)}${leaderboardHtml(p, meIdx)}${
            host
              ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${esc(tr('nextRound', 'Next round'))}</button>`
              : `<div class="pk-wait">${esc(tr('nextSoon', 'Next round deals automatically…'))}</div>`
          }</div>`;
          el.querySelector('[data-next]')?.addEventListener('click', () => ctrl.act('next_round'));
        },
        onOver(el, p, meIdx) {
          const set = ctrl.view.pub.settlement;
          const results = (set && set.results) || {};
          if (ctrl.ohno && !ctrl.ohno.fxDone) {
            ctrl.ohno.fxDone = true;
            const won = meIdx >= 0 && p.ranking[0] === meIdx;
            CK().fx(won ? 'win' : 'lose');
            if (typeof recordGameResult === 'function') recordGameResult(GAME, !!won);
          }
          const chip = (s) => {
            const r = results[s.id];
            if (!r || !r.chipDelta) return set && set.status === 'pending' && !s.bot ? '<span class="cl-rank-chips">…</span>' : '';
            return `<span class="cl-rank-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta}</span>`;
          };
          const win = p.seats[p.ranking[0]];
          el.innerHTML = `<div class="cl-result"><div class="cl-result-title">${esc(p.ranking[0] === meIdx ? tr('youWin', 'You win!') : win.name + ' ' + tr('wins', 'wins!'))}</div>${roundSummaryHtml(p, meIdx)}${leaderboardHtml(p, meIdx, chip)}${Kit().roomResultActions(ctrl, {
            nextLabel: tr('rematch', 'Rematch'),
            waitLabel: tr('waitRematch', 'Waiting for the host to start a rematch…'),
          })}</div>`;
          Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, shareText(p, meIdx)) });
        },
      });
      mount = ctrl.ohno = { roundNo: pub.roundNo, table, fxDone: false };
    }
    mount.table.update(st, priv, me);
  }

  function openRoom(code, opts) {
    const K = Kit();
    const o = opts || {};
    return K.openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: 1,
      max: 10,
      hydrate: (s) => Core().hydrateView(clone(s)),
      lobbySummary,
      openSettings: openRoomSettings,
      lobbyListHtml,
      canStart,
      errorText,
      renderPhase: renderLive,
    });
  }
  function createRoom(chat) {
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: roomDefaults(), open: (code) => openRoom(code, {}) });
  }

  // ---------------- home ----------------

  function openRules() {
    const R = window.DangalRules;
    const r = R && R.getRules ? R.getRules(GAME) : null;
    Kit().openSheet({
      title: tr('rulesTitle', 'How to play Oh No!'),
      bodyHtml: `<div class="cl-rules">${r ? `<p class="cl-note">${esc(r.ruleset.source)}</p>` + r.rules.map((x) => `<div class="cl-sub">${esc(x.h)}</div><p class="cl-note">${esc(x.body)}</p>`).join('') : ''}</div>`,
    });
  }

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Cards') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🃏'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Match colours and numbers, empty your hand, shout “Oh No!” at one card.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot"><span class="pk-mode-title">${esc(tr('botTitle', 'Play vs bots'))}</span><span class="pk-mode-sub">${esc(s.players + ' ' + tr('players', 'players') + ' · ' + CK().levelLabel(s.level) + ' · ' + targetLabel(s.target))}</span></button>
        <button type="button" class="pk-mode" data-go="friends"><span class="pk-mode-title">${esc(tr('friendTitle', 'Play with friends'))}</span><span class="pk-mode-sub">${esc(tr('friendSub', 'Live, 2–10 players · bots fill empty seats'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
          <button type="button" class="pk-link" data-go="change">${esc(tr('change', 'Change setup'))}</button>
          <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'How to play'))}</button>
          <button type="button" class="pk-link" data-go="prefs">${esc(tr('settings', 'Sound'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="bot"]').addEventListener('click', () => K.closeThen(shell, () => startLocal(loadSetup())));
    b.querySelector('[data-go="change"]').addEventListener('click', () => openLocalSheet((x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="friends"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      K.closeThen(shell, () => createRoom(opts.chat));
    });
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
    b.querySelector('[data-go="rules"]').addEventListener('click', openRules);
    b.querySelector('[data-go="prefs"]').addEventListener('click', () => CK().openPrefsSheet(['sound', 'haptics', 'speed']));
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Oh No! is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || chat.type === 'group' || chat.isGroup);
    if (c.practiceKind === 'vsAi' || c.mode === 'practice') return startLocal(loadSetup());
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
      id: 'uno',
      name: 'Oh No!',
      desc: 'Shedding card game · 2–10 players · bots · Live rooms',
      icon: '🃏',
      ratingKey: 'uno',
      gameType: 'party',
      genre: 'cards',
      dangal: true,
      liveParty: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 40,
      meta: {
        core: 'ohno-core.js (rules, house rules, bots; shared with the server)',
        live: 'party_room → server-lib/ohno-engine.js; CSPRNG deal, private hands in secrets, server-checked plays',
      },
      launch: openGame,
    });
  }

  window.OhNoGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal), mountTable, cardHtml };
})();
