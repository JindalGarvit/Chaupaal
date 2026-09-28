/**
 * Ludo (Dangal P3) — standard rules + house-rule toggles (ludo-core.js).
 * Home → Play vs bots · Pass & Play · Play with friends (party room, server dice) · Join by code.
 * One board renderer for every mode: tokens hop square by square from the state log.
 */
(function () {
  'use strict';

  const GAME = 'ludo';
  const SETUP_KEY = 'chaupaal_ludo_setup';
  const ROOM_KEY = 'chaupaal_ludo_room';
  const Core = () => window.LudoCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('ludo.' + key, fallback) : fallback;
  }
  const LABEL = 'Ludo';
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------------- house rules ----------------

  const RULES = [
    ['safeSquares', () => tr('rule.safe', 'Safe squares (start squares + stars)')],
    ['bonusHome', () => tr('rule.bonusHome', 'Bonus roll when a token reaches home')],
    ['captureBonus', () => tr('rule.captureBonus', 'Bonus roll for a capture')],
    ['killToEnter', () => tr('rule.killToEnter', 'Capture a token before entering your home column')],
    ['blocks', () => tr('rule.blocks', 'Blocks — two of your tokens on a square stop rivals')],
    ['places', () => tr('rule.places', 'Keep playing for 2nd and 3rd place')],
    ['quick', () => tr('rule.quick', 'Quick mode — tokens start out, first token home wins (~5 min)')],
    ['teams', () => tr('rule.teams', 'Teams 2v2 — partners sit opposite and can’t capture each other')],
  ];

  function houseRules(s) {
    const d = Core().DEFAULTS;
    const out = [];
    if (s.entry !== d.entry) out.push(tr('rule.entryShort', 'Start on a 1 or a 6'));
    RULES.forEach(([k, label]) => {
      if (s[k] !== d[k]) out.push(label() + ': ' + (s[k] ? tr('on', 'On') : tr('off', 'Off')));
    });
    return out;
  }
  function rulesLine(s) {
    const h = houseRules(s);
    return h.length ? tr('houseRules', 'House rules') + ': ' + h.length : tr('standard', 'Standard rules');
  }

  function houseRulesHtml(s) {
    const K = Kit();
    return `<div class="cl-rules">
      <div class="cl-sub">${esc(tr('rule.entry', 'Bring a token out on'))}</div>
      ${K.segHtml('entry', s.entry, [['six', tr('rule.six', 'A 6')], ['oneOrSix', tr('rule.oneOrSix', 'A 1 or a 6')]])}
      ${RULES.map(
        ([k, label]) => `<label class="cl-pref"><span>${esc(label())}</span><input type="checkbox" data-rule="${k}" ${s[k] ? 'checked' : ''}></label>`
      ).join('')}
      <p class="cl-note">${esc(tr('rule.fixed', 'Always on: a 6 rolls again, three 6s in a row lose the turn, exact roll to reach home.'))}</p>
    </div>`;
  }
  // ---------------- board ----------------

  function boardSvg(st) {
    const L = Core();
    const used = new Set(st.seats.map((s) => s.color));
    const hex = (c) => L.COLOR_HEX[c];
    let out = '<svg class="ld-svg" viewBox="0 0 15 15" aria-hidden="true"><rect width="15" height="15" fill="#f7f2e8"/>';
    L.COLORS.forEach((c) => {
      const [r, k] = L.BASE_ORIGIN[c];
      const op = used.has(c) ? 1 : 0.28;
      out += `<g opacity="${op}"><rect x="${k}" y="${r}" width="6" height="6" fill="${hex(c)}"/><rect x="${k + 0.7}" y="${r + 0.7}" width="4.6" height="4.6" rx="0.5" fill="#fff"/>`;
      [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]].forEach(([a, b]) => (out += `<circle cx="${k + b + 0.5}" cy="${r + a + 0.5}" r="0.62" fill="${hex(c)}" opacity="0.35"/>`));
      out += '</g>';
    });
    L.TRACK_CELLS.forEach(([r, k], abs) => {
      const startColor = L.COLORS.find((c) => L.START[c] === abs);
      out += `<rect x="${k}" y="${r}" width="1" height="1" fill="${startColor ? hex(startColor) : '#fff'}" stroke="#b9b2a6" stroke-width="0.04"/>`;
      if (st.settings.safeSquares && L.STARS.indexOf(abs) >= 0) out += `<g fill="none" stroke="#7b746a" stroke-width="0.07">${CK().shapePath('star', k + 0.5, r + 0.5, 0.36)}</g>`;
    });
    L.COLORS.forEach((c) => {
      L.COLUMN_CELLS[c].forEach(([r, k]) => (out += `<rect x="${k}" y="${r}" width="1" height="1" fill="${hex(c)}" opacity="${used.has(c) ? 0.85 : 0.3}" stroke="#b9b2a6" stroke-width="0.04"/>`));
    });
    const tri = { red: '6,6 6,9 7.5,7.5', green: '6,6 9,6 7.5,7.5', yellow: '9,6 9,9 7.5,7.5', blue: '6,9 9,9 7.5,7.5' };
    L.COLORS.forEach((c) => (out += `<polygon points="${tri[c]}" fill="${hex(c)}" opacity="${used.has(c) ? 1 : 0.3}"/>`));
    return out + '</svg>';
  }

  function pct(v) {
    return ((v + 0.5) / 15) * 100 + '%';
  }

  // ---------------- game view (shared by every mode) ----------------

  /**
   * @param {object} shell PartyKit shell
   * @param {{ st: object, live?: boolean, mine: (st) => number[], onRoll: Function, onMove: (token:number) => void,
   *           onOver?: (st, el) => void, afterPaint?: (st) => void, controlsExtra?: (st) => string,
   *           wireControls?: (el) => void, subtitle?: string }} o
   */
  function mountGame(shell, o) {
    const L = Core();
    const K = CK();
    const body = shell.render(`<div class="pk-page ld-game">
      <div class="cl-players" data-players></div>
      <div class="cl-banner" data-banner role="status" aria-live="polite"></div>
      <div class="ld-board-wrap"><div class="ld-board" data-ludo-board>${boardSvg(o.st)}<div class="ld-layer" data-ghosts></div><div class="ld-layer" data-tokens></div><div class="ld-fx" data-fx></div></div></div>
      <div class="cl-controls" data-controls></div>
      <div class="cl-foot">
        <button type="button" class="pk-link" data-dice-history>${esc(tr('diceHistory', 'Dice history'))}</button>
        <button type="button" class="pk-link" data-rules>${esc(tr('rules', 'Rules'))}</button>
        <button type="button" class="pk-link" data-prefs>${esc(tr('settings', 'Settings'))}</button>
      </div>
    </div>`);
    const g = { st: clone(o.st), disp: null, lastSeq: o.st.seq, queue: Promise.resolve(), busy: false, banner: '', destroyed: false };
    g.disp = g.st.seats.map((s) => s.tokens.slice());
    const tokensEl = body.querySelector('[data-tokens]');
    const ghostsEl = body.querySelector('[data-ghosts]');
    const fxEl = body.querySelector('[data-fx]');
    const tokenEls = {};

    g.st.seats.forEach((s, si) =>
      s.tokens.forEach((_, ti) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'ld-token';
        el.dataset.seat = si;
        el.dataset.token = ti;
        el.style.setProperty('--tok', L.COLOR_HEX[s.color]);
        el.innerHTML = K.shapeSvg(L.SHAPES[s.color], L.COLOR_HEX[s.color], 22);
        el.setAttribute('aria-label', L.COLOR_LABEL[s.color] + ' ' + tr('token', 'token') + ' ' + (ti + 1));
        tokensEl.appendChild(el);
        tokenEls[si + ':' + ti] = el;
      })
    );

    function placeTokens() {
      const groups = {};
      g.st.seats.forEach((s, si) =>
        g.disp[si].forEach((p, ti) => {
          const [r, c] = L.cellOf(s.color, p, ti);
          const key = p === L.BASE ? 'b' + si + ti : r + ',' + c;
          (groups[key] = groups[key] || []).push({ si, ti, r, c, p });
        })
      );
      Object.keys(groups).forEach((key) => {
        const list = groups[key];
        list.forEach((it, k) => {
          const el = tokenEls[it.si + ':' + it.ti];
          const n = list.length;
          const off = n > 1 ? (k - (n - 1) / 2) * 0.28 : 0;
          el.style.left = pct(it.c + off);
          el.style.top = pct(it.r + (n > 1 ? off * 0.4 : 0));
          el.classList.toggle('is-stacked', n > 1);
          el.classList.toggle('is-home', it.p === L.HOME);
        });
      });
    }

    function mySeatsNow() {
      return o.mine(g.st);
    }
    function myTurn() {
      return !g.st.over && mySeatsNow().indexOf(g.st.turn) >= 0;
    }
    function legal() {
      return myTurn() && g.st.phase === 'move' && !g.busy ? L.legalMoves(g.st) : [];
    }

    function paintPlayers() {
      const mine = mySeatsNow();
      body.querySelector('[data-players]').innerHTML = g.st.seats
        .map((s, i) => {
          const home = s.tokens.filter((p) => p === L.HOME).length;
          const tags = [];
          if (mine.indexOf(i) >= 0 && (o.live || mine.length === 1)) tags.push(tr('you', 'You'));
          if (s.bot) tags.push(s.forfeit ? tr('botPlaying', 'Bot playing') : tr('bot', 'Bot'));
          if (g.st.settings.teams) tags.push(s.team === 0 ? tr('teamA', 'Team A') : tr('teamB', 'Team B'));
          return `<div class="cl-player${i === g.st.turn && !g.st.over ? ' is-turn' : ''}${s.forfeit ? ' is-out' : ''}">
            ${K.shapeSvg(L.SHAPES[s.color], L.COLOR_HEX[s.color], 18)}
            <span class="cl-player-name">${esc(s.name)}</span>
            ${tags.map((x) => `<span class="cl-tag">${esc(x)}</span>`).join('')}
            <span class="cl-player-meta">${s.place ? esc(K.placeLabel(s.place)) : home + '/4 ' + esc(tr('home', 'home'))}</span>
          </div>`;
        })
        .join('');
    }

    function turnText() {
      const st = g.st;
      if (st.over) return tr('over', 'Game over');
      const seat = st.seats[st.turn];
      if (myTurn()) {
        if (st.phase === 'roll') return mySeatsNow().length > 1 && !o.live ? seat.name + ' — ' + tr('rollNow', 'roll the die') : tr('yourRoll', 'Your turn — roll the die');
        return tr('pickToken', 'Rolled') + ' ' + st.dice + ' · ' + tr('pickToken2', 'tap a highlighted token');
      }
      return seat.name + (seat.bot ? ' (' + tr('bot', 'Bot') + ')' : '') + ' — ' + (st.phase === 'move' ? tr('moving', 'moving') : tr('rolling', 'to roll'));
    }

    function setBanner(text, tone) {
      const el = body.querySelector('[data-banner]');
      el.textContent = text;
      el.dataset.tone = tone || '';
    }

    function paintGhosts() {
      const moves = legal();
      const moverColor = moves.length ? g.st.seats[moves[0].seat].color : null;
      ghostsEl.innerHTML = moves
        .map((m) => {
          const [r, c] = L.cellOf(moverColor, m.to, m.token);
          return `<span class="ld-ghost" style="left:${pct(c)};top:${pct(r)};--tok:${L.COLOR_HEX[moverColor]}" aria-hidden="true">${m.captures.length ? '✕' : ''}</span>`;
        })
        .join('');
      Object.values(tokenEls).forEach((el) => el.classList.remove('is-legal'));
      moves.forEach((m) => tokenEls[m.seat + ':' + m.token].classList.add('is-legal'));
    }

    function paintControls() {
      const el = body.querySelector('[data-controls]');
      const st = g.st;
      if (st.over) {
        el.innerHTML = '';
        if (o.onOver) o.onOver(st, el);
        return;
      }
      const canRoll = myTurn() && st.phase === 'roll' && !g.busy;
      el.innerHTML = `<div class="cl-dice-row-main">${K.diceHtml({ value: st.dice, canRoll, waitLabel: myTurn() ? '' : tr('waiting', 'Waiting') })}${o.controlsExtra ? o.controlsExtra(st) : ''}</div>`;
      el.querySelector('[data-roll]')?.addEventListener('click', async (e) => {
        if (!myTurn() || g.st.phase !== 'roll' || g.busy) return;
        e.currentTarget.disabled = true;
        e.currentTarget.querySelector('[data-die-art]')?.classList.add('is-rolling');
        o.onRoll();
      });
      if (o.wireControls) o.wireControls(el);
    }

    function paint() {
      if (g.destroyed || shell.closed) return;
      placeTokens();
      paintPlayers();
      setBanner(turnText(), myTurn() ? 'you' : '');
      paintGhosts();
      paintControls();
      if (o.afterPaint) o.afterPaint(g.st);
    }

    function flash(r, c, cls) {
      const d = document.createElement('span');
      d.className = 'ld-burst ' + (cls || '');
      d.style.left = pct(c);
      d.style.top = pct(r);
      fxEl.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }

    async function play(events) {
      for (const e of events) {
        if (g.destroyed || shell.closed) return;
        const seat = g.st.seats[e.seat];
        const name = seat ? seat.name : '';
        if (e.type === 'roll') {
          const dieHost = body.querySelector('[data-controls]');
          if (!dieHost.querySelector('[data-die-art]')) dieHost.innerHTML = `<div class="cl-dice-row-main">${K.diceHtml({ value: 0, canRoll: false })}</div>`;
          await K.animateDie(dieHost, e.value);
          const lbl = dieHost.querySelector('.cl-die-label');
          if (lbl) lbl.textContent = name + ' · ' + e.value;
          setBanner(name + ' ' + tr('rolled', 'rolled') + ' ' + e.value);
          await K.sleep(K.ms(260));
        } else if (e.type === 'move') {
          const color = g.st.seats[e.seat].color;
          for (const q of e.path || [e.to]) {
            g.disp[e.seat][e.token] = q;
            placeTokens();
            K.fx('hop');
            await K.sleep(K.ms(150));
          }
          if ((e.captures || []).length) {
            const [r, c] = L.cellOf(color, e.to, e.token);
            flash(r, c, 'is-capture');
            K.fx('capture');
            e.captures.forEach((cp) => (g.disp[cp.seat][cp.token] = L.BASE));
            await K.sleep(K.ms(120));
            placeTokens();
            setBanner(name + ' ' + tr('captured', 'captured a token!'), 'capture');
            await K.sleep(K.ms(420));
          }
          if (e.to === L.HOME) {
            K.fx('home');
            setBanner(name + ' ' + tr('tokenHome', 'brought a token home'));
            await K.sleep(K.ms(300));
          }
        } else if (e.type === 'triple_six') {
          K.fx('invalid');
          setBanner(tr('tripleSix', 'Three 6s in a row — turn lost'), 'warn');
          await K.sleep(K.ms(900));
        } else if (e.type === 'no_move') {
          setBanner(name + ' — ' + tr('noMove', 'no move possible'));
          await K.sleep(K.ms(seat && seat.bot ? 350 : 650));
        } else if (e.type === 'bonus') {
          setBanner(name + ' — ' + (e.why === 'six' ? tr('bonusSix', 'rolled a 6, roll again') : e.why === 'capture' ? tr('bonusCapture', 'capture bonus roll') : tr('bonusHome', 'home bonus roll')));
          await K.sleep(K.ms(300));
        } else if (e.type === 'takeover') {
          toast(name + ' — ' + (e.reason === 'afk' ? tr('takeoverAfk', 'a bot took over after missed turns') : tr('takeoverLeft', 'left; a bot is playing the seat')));
        } else if (e.type === 'finished') {
          K.fx('home');
          setBanner(name + ' ' + tr('finished', 'finished') + ' ' + K.placeLabel(e.place), 'good');
          await K.sleep(K.ms(600));
        }
      }
    }

    tokensEl.addEventListener('click', (e) => {
      const el = e.target.closest('.ld-token');
      if (!el) return;
      const moves = legal();
      const m = moves.find((x) => x.seat === Number(el.dataset.seat) && x.token === Number(el.dataset.token));
      if (!m) {
        if (myTurn() && g.st.phase === 'move') K.fx('invalid');
        return;
      }
      g.busy = true;
      paintGhosts();
      o.onMove(m.token);
    });
    body.querySelector('[data-dice-history]').addEventListener('click', () =>
      K.openDiceSheet({
        game: GAME,
        live: !!o.live,
        seats: g.st.seats.map((s, i) => ({ name: s.name, color: L.COLOR_HEX[s.color], shape: L.SHAPES[s.color], rolls: g.st.rolls[i] || [] })),
      })
    );
    body.querySelector('[data-rules]').addEventListener('click', () => {
      if (window.DangalRules) DangalRules.openSheet(GAME, { variants: ruleVariants(g.st.settings) });
    });
    body.querySelector('[data-prefs]').addEventListener('click', () => K.openPrefsSheet(['sound', 'haptics', 'autoMove', 'speed'], () => paint()));

    paint();

    return {
      get st() {
        return g.st;
      },
      update(next) {
        const st = clone(next);
        const events = (st.log || []).filter((e) => e.seq > g.lastSeq);
        g.lastSeq = st.seq;
        g.busy = true;
        g.queue = g.queue
          .then(() => play(events))
          .catch(() => {})
          .then(() => {
            g.st = st;
            g.disp = st.seats.map((s) => s.tokens.slice());
            g.busy = false;
            paint();
          });
        return g.queue;
      },
      unlock() {
        g.busy = false;
        paint();
      },
      repaint: paint,
      destroy() {
        g.destroyed = true;
      },
    };
  }

  function ruleVariants(s) {
    return { mode: s.quick ? 'quick' : 'classic', entry: s.entry, captureBonus: s.captureBonus, killToEnter: s.killToEnter, blocks: s.blocks, safeSquares: s.safeSquares, bonusHome: s.bonusHome, teams: s.teams, places: s.places };
  }

  function rankingHtml(st, extra) {
    const L = Core();
    const K = CK();
    return `<div class="cl-ranking">${(st.ranking || [])
      .map((si, k) => {
        const s = st.seats[si];
        const x = extra ? extra(s, k) : '';
        return `<div class="cl-rank-row${k === 0 ? ' is-first' : ''}"><span class="cl-rank-place">${esc(K.placeLabel(k + 1))}</span>${K.shapeSvg(L.SHAPES[s.color], L.COLOR_HEX[s.color], 18)}<span class="cl-rank-name">${esc(s.name)}${s.forfeit ? ' · ' + esc(tr('forfeited', 'forfeited')) : ''}</span>${x}</div>`;
      })
      .join('')}</div>`;
  }

  // ---------------- local play (vs bots / pass & play) ----------------

  function defaultSetup() {
    return { count: 4, seats: [{ kind: 'human', name: '' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }], level: 'normal', rules: Object.assign({}, Core().DEFAULTS) };
  }
  function loadSetup() {
    const s = CK().readJson(SETUP_KEY, null) || defaultSetup();
    s.rules = Core().mergeSettings(s.rules);
    s.seats = (s.seats || []).slice(0, 4);
    while (s.seats.length < 4) s.seats.push({ kind: 'bot' });
    s.count = Math.max(2, Math.min(4, Number(s.count) || 4));
    return s;
  }
  function myDisplayName() {
    return (Kit() && Kit().myName()) || tr('you', 'You');
  }

  function openSetup(kind, onDone) {
    const K = Kit();
    const L = Core();
    const s = loadSetup();
    if (kind === 'pass') s.seats = s.seats.map((x, i) => ({ kind: 'human', name: x.kind === 'human' && x.name ? x.name : i === 0 ? myDisplayName() : tr('player', 'Player') + ' ' + (i + 1) }));
    else s.seats = s.seats.map((x, i) => (i === 0 ? { kind: 'human', name: myDisplayName() } : x));
    const seatView = () => {
      const colors = L.colorsFor(s.count);
      return s.seats.slice(0, s.count).map((x, i) => ({ kind: x.kind, name: x.kind === 'bot' ? tr('bot', 'Bot') : x.name || tr('player', 'Player') + ' ' + (i + 1), color: L.COLOR_HEX[colors[i]], shape: L.SHAPES[colors[i]] }));
    };
    K.openSheet({
      title: kind === 'pass' ? tr('passTitle', 'Pass & Play') : tr('botsTitle', 'Play vs bots'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('players', 'Players'))}</div>
        <div data-count-seg></div>
        <div data-seats></div>
        <div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>
        <div data-level-seg>${K.segHtml('level', s.level, L.LEVELS.map((l) => [l, CK().levelLabel(l)]))}</div>
        <details class="cl-advanced"><summary>${esc(tr('houseRules', 'House rules'))} · <span data-rules-line>${esc(rulesLine(s.rules))}</span></summary>${houseRulesHtml(s.rules)}</details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('start', 'Start'))}</button>
      </div>`,
      onMount(el, close) {
        const paintSeats = () => {
          el.querySelector('[data-count-seg]').innerHTML = K.segHtml('count', s.count, [[2, '2'], [3, '3'], [4, '4']]);
          K.wireSegs(el.querySelector('[data-count-seg]'), s, () => {
            s.count = Number(s.count);
            paintSeats();
          });
          el.querySelector('[data-seats]').innerHTML = CK().seatPickerHtml(seatView(), { lockFirst: kind !== 'pass' });
          el.querySelectorAll('[data-seat-kind]').forEach((sel) =>
            sel.addEventListener('change', () => {
              const i = Number(sel.dataset.seatKind);
              s.seats[i] = { kind: sel.value, name: sel.value === 'human' ? tr('player', 'Player') + ' ' + (i + 1) : '' };
              paintSeats();
            })
          );
          el.querySelectorAll('[data-seat-name]').forEach((inp) => inp.addEventListener('input', () => (s.seats[Number(inp.dataset.seatName)].name = inp.value.trim())));
        };
        paintSeats();
        K.wireSegs(el.querySelector('[data-level-seg]'), s, () => {});
        const rulesEl = el.querySelector('.cl-rules');
        const syncLine = () => (el.querySelector('[data-rules-line]').textContent = rulesLine(s.rules));
        Kit().wireSegs(rulesEl, s.rules, syncLine);
        rulesEl.querySelectorAll('[data-rule]').forEach((box) =>
          box.addEventListener('change', () => {
            s.rules[box.dataset.rule] = box.checked;
            syncLine();
          })
        );
        el.querySelector('[data-go]').addEventListener('click', () => {
          s.count = Number(s.count);
          if (s.rules.teams && s.count !== 4) return toast(tr('teamsNeed4', 'Teams 2v2 needs 4 players'));
          CK().writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onDone(s), 80);
        });
      },
    });
  }

  function startLocal(setup, kind) {
    const K = Kit();
    const L = Core();
    const C = CK();
    const seats = setup.seats.slice(0, setup.count);
    let botN = 0;
    const players = seats.map((x, i) =>
      x.kind === 'bot'
        ? { id: 'b' + i, name: tr('bot', 'Bot') + ' ' + ++botN + ' · ' + C.levelLabel(setup.level), bot: true, level: setup.level }
        : { id: 'p' + i, name: x.name || (i === 0 ? myDisplayName() : tr('player', 'Player') + ' ' + (i + 1)) }
    );
    if (!players.some((p) => !p.bot)) players[0] = { id: 'p0', name: myDisplayName() };
    const st = L.newGame(players, setup.rules);
    if (st.error) return toast(st.error === 'teams_need_four' ? tr('teamsNeed4', 'Teams 2v2 needs 4 players') : tr('needPlayers', 'Ludo needs 2–4 players'));
    const rng = C.seededRng(C.newSeed());
    let timer = null;
    let recorded = false;
    const humans = st.seats.map((s, i) => i).filter((i) => !st.seats[i].bot);
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: humans.length > 1 ? tr('passTitle', 'Pass & Play') : tr('practice', 'Practice vs bots'),
      confirmLeave: () => !st.over,
      leaveBody: tr('leaveLocal', 'This game will end.'),
      onClose: () => clearTimeout(timer),
    });
    if (typeof ensureRulesButton === 'function') {
      try {
        ensureRulesButton(GAME);
      } catch (e) {}
    }
    const view = mountGame(shell, {
      st,
      mine: (s) => s.seats.map((x, i) => i).filter((i) => !s.seats[i].bot),
      onRoll() {
        L.roll(st, rng.die());
        view.update(st);
      },
      onMove(token) {
        const out = L.move(st, token);
        if (out && out.error) return view.unlock();
        view.update(st);
      },
      afterPaint(shown) {
        clearTimeout(timer);
        if (st.over || shown.seq !== st.seq || shell.closed) return;
        const seat = st.seats[st.turn];
        if (seat.bot) {
          timer = setTimeout(() => {
            if (shell.closed || st.over) return;
            if (st.phase === 'roll') L.roll(st, rng.die());
            else L.move(st, L.botChoose(st, seat.level, rng));
            view.update(st);
          }, C.ms(st.phase === 'roll' ? 600 : 380));
        } else if (st.phase === 'move' && C.prefs().autoMove) {
          const moves = L.legalMoves(st);
          if (moves.length === 1)
            timer = setTimeout(() => {
              if (shell.closed || st.over || st.phase !== 'move') return;
              L.move(st, moves[0].token);
              view.update(st);
            }, C.ms(450));
        }
      },
      onOver(shown, el) {
        if (!recorded) {
          recorded = true;
          C.recordPracticeRolls(humans.reduce((a, i) => a.concat(st.rolls[i] || []), []));
          if (humans.length === 1) {
            const won = st.ranking[0] === humans[0] || (st.settings.teams && st.seats[humans[0]].team === st.winnerTeam);
            C.fx(won ? 'win' : 'lose');
            if (typeof recordGameResult === 'function') recordGameResult(GAME, !!won);
          } else C.fx('win');
        }
        const win = st.seats[st.ranking[0]];
        const teamLine = st.settings.teams ? (st.winnerTeam === 0 ? tr('teamA', 'Team A') : tr('teamB', 'Team B')) + ' ' + tr('wins', 'wins!') : win.name + ' ' + tr('wins', 'wins!');
        el.innerHTML = `<div class="cl-result">
          <div class="cl-result-title">${esc(teamLine)}</div>
          ${rankingHtml(shown)}
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row">
            <button type="button" class="pk-btn pk-btn--ghost" data-share>${esc(tr('share', 'Share'))}</button>
            <button type="button" class="pk-btn pk-btn--ghost" data-setup>${esc(tr('changeSetup', 'Change setup'))}</button>
          </div>
        </div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(setup, kind)));
        el.querySelector('[data-setup]').addEventListener('click', () => K.closeThen(shell, () => openSetup(kind, (s) => startLocal(s, kind))));
        el.querySelector('[data-share]').addEventListener('click', () => C.shareWin(GAME, LABEL, teamLine + ' · ' + rulesLine(st.settings)));
      },
    });
  }

  // ---------------- Live room ----------------

  function roomDefaults() {
    return Object.assign({ bots: 0, botLevel: 'normal', stake: 0 }, Core().DEFAULTS, CK().readJson(ROOM_KEY, {}));
  }

  function lobbySummary(ctrl) {
    const s = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const bits = [rulesLine(Core().mergeSettings(s))];
    if (s.bots) bits.push(s.bots + ' ' + (s.bots === 1 ? tr('botOne', 'bot') : tr('botMany', 'bots')) + ' · ' + CK().levelLabel(s.botLevel));
    bits.push(CK().stakeLabel(Number(s.stake) || 0));
    return bits.join(' · ');
  }

  function openRoomSettings(ctrl) {
    const K = Kit();
    const cur = Object.assign({}, roomDefaults(), (ctrl.view.pub && ctrl.view.pub.settings) || {});
    const humans = ctrl.players().length;
    K.openSheet({
      title: tr('roomSettings', 'Room settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('fillBots', 'Fill empty seats with bots'))}</div>
        ${K.segHtml('bots', cur.bots, [0, 1, 2, 3].filter((n) => n + humans <= 4 || n === 0).map((n) => [n, String(n)]))}
        ${K.segHtml('botLevel', cur.botLevel, Core().LEVELS.map((l) => [l, CK().levelLabel(l)]))}
        <div class="cl-sub">${esc(tr('stake', 'Stake'))}</div>
        ${K.segHtml('stake', cur.stake, CK().STAKES.map((n) => [n, n ? '⚡' + n : tr('friendly', 'Friendly')]))}
        <p class="cl-note">${esc(tr('payouts', 'Everyone antes the stake. 2 players: winner takes both. 3: 70% / 30%. 4: 60% / 30% / 10%. Teams: winners take the losers’ stakes. Virtual chips only.'))}</p>
        <details class="cl-advanced"><summary>${esc(tr('houseRules', 'House rules'))}</summary>${houseRulesHtml(cur)}</details>
        <p class="cl-note">${esc(tr('lockedAtStart', 'House rules lock when the game starts and show for everyone.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        el.querySelectorAll('[data-rule]').forEach((box) => box.addEventListener('change', () => (cur[box.dataset.rule] = box.checked)));
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const next = Object.assign({}, cur, { bots: Number(cur.bots), stake: Number(cur.stake) });
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
    const bots = Math.max(0, Math.min(Number(s.bots) || 0, 4 - players.length));
    const rows = players.map(
      (p) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${p.id === pub.host ? '<span class="pk-badge">Host</span>' : ''}${
        p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">You</span>' : ''
      }</div>`
    );
    for (let i = 0; i < bots; i++) rows.push(`<div class="pk-lobby-row is-bot"><span class="pk-dot is-online"></span><span>🤖 ${esc(tr('bot', 'Bot') + ' ' + (i + 1) + ' · ' + CK().levelLabel(s.botLevel))}</span></div>`);
    const house = houseRules(Core().mergeSettings(s));
    return `<div class="pk-lobby-list">${rows.join('')}</div>${
      house.length ? `<div class="cl-house"><div class="cl-sub">${esc(tr('houseRulesInGame', 'House rules in this game'))}</div><ul>${house.map((h) => '<li>' + esc(h) + '</li>').join('')}</ul></div>` : ''
    }`;
  }

  function canStart(ctrl, players) {
    const s = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const total = players.length + Math.max(0, Math.min(Number(s.bots) || 0, 4 - players.length));
    if (s.teams && total !== 4) return { ok: false, label: tr('teamsNeed4', 'Teams 2v2 needs 4 players') };
    if (total < 2) return { ok: false, label: tr('addBotOrFriend', 'Add a bot or invite a friend') };
    return { ok: true, label: tr('start', 'Start') };
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const mount = ctrl.ludo;
    const alive = mount && mount.round === pub.roundNo && ctrl.shell.body.querySelector('[data-ludo-board]');
    if (alive) {
      mount.view.update(st);
      return;
    }
    const mine = (s) => s.seats.map((x, i) => i).filter((i) => s.seats[i].id === ctrl.uid && !s.seats[i].forfeit);
    let autoTimer = null;
    const view = mountGame(ctrl.shell, {
      st,
      live: true,
      mine,
      onRoll: async () => {
        const out = await ctrl.act('roll');
        if (!out) view.unlock();
      },
      onMove: async (token) => {
        const out = await ctrl.act('move', { token });
        if (!out) view.unlock();
      },
      controlsExtra: () => '<span class="cl-timer pk-timer" data-timer></span>',
      wireControls: (el) => ctrl.wire(el),
      afterPaint(shown) {
        clearTimeout(autoTimer);
        if (shown.over || mine(shown).indexOf(shown.turn) < 0 || shown.phase !== 'move' || !CK().prefs().autoMove) return;
        const moves = Core().legalMoves(Core().hydrate(clone(shown)));
        if (moves.length === 1)
          autoTimer = setTimeout(async () => {
            const out = await ctrl.act('move', { token: moves[0].token });
            if (!out) view.unlock();
          }, CK().ms(500));
      },
      onOver(shown, el) {
        const set = ctrl.view.pub.settlement;
        const results = (set && set.results) || {};
        const me = shown.seats.findIndex((x) => x.id === ctrl.uid);
        if (ctrl.ludo && !ctrl.ludo.fxDone) {
          ctrl.ludo.fxDone = true;
          const won = me >= 0 && (shown.ranking[0] === me || (shown.settings.teams && shown.seats[me].team === shown.winnerTeam));
          CK().fx(won ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, !!won);
        }
        const chip = (s) => {
          const r = results[s.id];
          if (!r || !r.chipDelta) return set && set.status === 'pending' && !s.bot ? '<span class="cl-rank-chips">…</span>' : '';
          return `<span class="cl-rank-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta}</span>`;
        };
        const win = shown.seats[shown.ranking[0]];
        const line = shown.settings.teams ? (shown.winnerTeam === 0 ? tr('teamA', 'Team A') : tr('teamB', 'Team B')) + ' ' + tr('wins', 'wins!') : win.name + ' ' + tr('wins', 'wins!');
        el.innerHTML = `<div class="cl-result"><div class="cl-result-title">${esc(line)}</div>${rankingHtml(shown, (s) => chip(s))}${Kit().roomResultActions(ctrl, {
          nextLabel: tr('rematch', 'Rematch'),
          waitLabel: tr('waitRematch', 'Waiting for the host to start a rematch…'),
        })}</div>`;
        Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, line) });
      },
    });
    ctrl.ludo = { round: pub.roundNo, view, fxDone: false };
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
      max: 4,
      hydrate: (s) => Core().hydrate(clone(s)),
      lobbySummary,
      openSettings: openRoomSettings,
      lobbyListHtml,
      canStart,
      renderPhase: renderLive,
    });
  }

  function createRoom(chat) {
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: roomDefaults(), open: (code) => openRoom(code, {}) });
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Board') });
    const setup = loadSetup();
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🎲'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Roll, race your four tokens home, capture rivals on the way.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bots">
          <span class="pk-mode-title">${esc(tr('botsTitle', 'Play vs bots'))}</span>
          <span class="pk-mode-sub">${esc(setup.count + ' ' + tr('players', 'players') + ' · ' + CK().levelLabel(setup.level) + ' · ' + rulesLine(setup.rules))}</span>
        </button>
        <button type="button" class="pk-mode" data-go="friends">
          <span class="pk-mode-title">${esc(tr('friendsTitle', 'Play with friends'))}</span>
          <span class="pk-mode-sub">${esc(tr('friendsSub', '2–4 players on their own phones · bots can fill seats'))}</span>
        </button>
        <button type="button" class="pk-mode" data-go="pass">
          <span class="pk-mode-title">${esc(tr('passTitle', 'Pass & Play'))}</span>
          <span class="pk-mode-sub">${esc(tr('passSub', 'One phone, pass it around'))}</span>
        </button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
          <button type="button" class="pk-link" data-go="setup">${esc(tr('changeSetup', 'Change setup'))}</button>
          <button type="button" class="pk-link" data-go="dice">${esc(tr('diceHistory', 'Dice history'))}</button>
          <button type="button" class="pk-link" data-go="prefs">${esc(tr('settings', 'Settings'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="bots"]').addEventListener('click', () => K.closeThen(shell, () => startLocal(loadSetup(), 'bots')));
    b.querySelector('[data-go="setup"]').addEventListener('click', () => openSetup('bots', (s) => K.closeThen(shell, () => startLocal(s, 'bots'))));
    b.querySelector('[data-go="pass"]').addEventListener('click', () => openSetup('pass', (s) => K.closeThen(shell, () => startLocal(s, 'pass'))));
    b.querySelector('[data-go="friends"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      K.closeThen(shell, () => createRoom(opts.chat));
    });
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
    b.querySelector('[data-go="dice"]').addEventListener('click', () => CK().openDiceSheet({ game: GAME, seats: [] }));
    b.querySelector('[data-go="prefs"]').addEventListener('click', () => CK().openPrefsSheet(['sound', 'haptics', 'autoMove', 'speed']));
  }

  // ---------------- registration ----------------

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Ludo is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || c.isGroup || chat.type === 'group' || chat.isGroup);
    if (c.practiceKind === 'vsAi' || c.mode === 'practice') return startLocal(loadSetup(), 'bots');
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
      id: 'ludo',
      name: 'Ludo',
      desc: '2–4 players · house rules · bots · Live rooms with server dice',
      icon: '🎲',
      ratingKey: 'ludo',
      gameType: 'multiplayer',
      genre: 'board',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      chatGroup: true,
      selfChat: true,
      ownHome: true,
      order: 30,
      meta: {
        core: 'ludo-core.js (standard rules + house-rule toggles + bots, shared with the server)',
        live: 'party_room → server-lib/classics-rooms.js; server CSPRNG dice, bot takeover, placement chips',
      },
      launch: openGame,
    });
  }

  window.LudoGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy((s) => startLocal(s || loadSetup(), 'bots')) };
  window.openLudoGame = function () {
    openGame({ source: 'manch', mode: 'home' });
  };
  window.openLudoPracticeSheet = function () {
    openGame({ source: 'manch', practiceKind: 'vsAi' });
  };
})();
