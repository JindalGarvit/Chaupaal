/**
 * Snakes & Ladders (Dangal P3) — standard 100-square rules (snakes-core.js), four validated boards.
 * A game of chance: roll, climb, slide. Play vs bots · Pass & Play · Play with friends (server dice).
 */
(function () {
  'use strict';

  const GAME = 'snakes';
  const SETUP_KEY = 'chaupaal_snakes_setup';
  const ROOM_KEY = 'chaupaal_snakes_room';
  const Core = () => window.SnakesCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('snakes.' + key, fallback) : fallback;
  }
  const LABEL = 'Snakes & Ladders';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  const THEMES = {
    classic: { a: '#fdf3d8', b: '#f3dca6', snake: '#2e7d32', ladder: '#8d5a2b', text: '#6d5a3a' },
    jungle: { a: '#e6f4d9', b: '#c8e3b0', snake: '#6a1b9a', ladder: '#795548', text: '#3e5a2a' },
    galaxy: { a: '#1f2448', b: '#2c3366', snake: '#ff7043', ladder: '#80deea', text: '#c5cae9' },
    moksha: { a: '#fff4e0', b: '#f7d9a8', snake: '#b71c1c', ladder: '#e0a100', text: '#7a4b12' },
  };

  function boardName(id) {
    const b = Core().boardById(id);
    return tr('board.' + b.id, b.name);
  }
  function settingsLine(s) {
    const bits = [boardName(s.board)];
    if (s.exact === 'bounce') bits.push(tr('bounce', 'Bounce back'));
    if (s.speed) bits.push(tr('speed', 'Speed'));
    return bits.join(' · ');
  }

  // ---------------- board ----------------

  function center(sq) {
    const [r, c] = Core().cellOf(sq);
    return [c + 0.5, r + 0.5];
  }

  function snakePath(from, to, color) {
    const [x1, y1] = center(from);
    const [x2, y2] = center(to);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = Math.min(1.2, len * 0.22);
    const c1 = [x1 + dx * 0.3 + nx * w, y1 + dy * 0.3 + ny * w];
    const c2 = [x1 + dx * 0.7 - nx * w, y1 + dy * 0.7 - ny * w];
    const d = `M${x1.toFixed(2)},${y1.toFixed(2)} C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`;
    return `<g class="sl-snake"><path d="${d}" stroke="#1b1b1b" stroke-width="0.34" fill="none" stroke-linecap="round" opacity="0.35"/><path d="${d}" stroke="${color}" stroke-width="0.24" fill="none" stroke-linecap="round" stroke-dasharray="0.5 0.12"/><circle cx="${x1}" cy="${y1}" r="0.22" fill="${color}" stroke="#1b1b1b" stroke-width="0.04"/><circle cx="${x1 - 0.07}" cy="${y1 - 0.05}" r="0.04" fill="#fff"/><circle cx="${x1 + 0.07}" cy="${y1 - 0.05}" r="0.04" fill="#fff"/></g>`;
  }

  function ladderPath(from, to, color) {
    const [x1, y1] = center(from);
    const [x2, y2] = center(to);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 0.17;
    const ny = (dx / len) * 0.17;
    let rungs = '';
    const n = Math.max(2, Math.floor(len / 0.45));
    for (let i = 1; i < n; i++) {
      const tx = x1 + (dx * i) / n;
      const ty = y1 + (dy * i) / n;
      rungs += `<line x1="${(tx + nx).toFixed(2)}" y1="${(ty + ny).toFixed(2)}" x2="${(tx - nx).toFixed(2)}" y2="${(ty - ny).toFixed(2)}"/>`;
    }
    return `<g class="sl-ladder" stroke="${color}" stroke-width="0.08" stroke-linecap="round"><line x1="${x1 + nx}" y1="${y1 + ny}" x2="${x2 + nx}" y2="${y2 + ny}"/><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x2 - nx}" y2="${y2 - ny}"/>${rungs}</g>`;
  }

  function boardSvg(boardId) {
    const S = Core();
    const b = S.boardById(boardId);
    const th = THEMES[b.theme] || THEMES.classic;
    let out = `<svg class="sl-svg" viewBox="0 0 10 10" aria-hidden="true">`;
    for (let sq = 1; sq <= 100; sq++) {
      const [r, c] = S.cellOf(sq);
      out += `<rect x="${c}" y="${r}" width="1" height="1" fill="${(r + c) % 2 ? th.b : th.a}"/>`;
      out += `<text x="${c + 0.08}" y="${r + 0.28}" font-size="0.24" fill="${th.text}" font-family="Space Grotesk,sans-serif">${sq}</text>`;
      if (b.labels[sq]) out += `<text x="${c + 0.5}" y="${r + 0.9}" font-size="0.16" fill="${th.text}" text-anchor="middle" font-family="Space Grotesk,sans-serif">${esc(b.labels[sq])}</text>`;
    }
    Object.keys(b.ladders).forEach((k) => (out += ladderPath(Number(k), b.ladders[k], th.ladder)));
    const snakeHues = [th.snake, '#8E3B8E', '#B5462E', '#2F6E9E', '#6B7F1E'];
    Object.keys(b.snakes).forEach((k, i) => (out += snakePath(Number(k), b.snakes[k], snakeHues[i % snakeHues.length])));
    return out + '</svg>';
  }

  // ---------------- game view ----------------

  function mountGame(shell, o) {
    const S = Core();
    const K = CK();
    const body = shell.render(`<div class="pk-page sl-game">
      <div class="cl-players" data-players></div>
      <div class="cl-banner" data-banner role="status" aria-live="polite"></div>
      <div class="sl-board-wrap"><div class="sl-board" data-sl-board>${boardSvg(o.st.board)}<div class="ld-layer" data-tokens></div></div></div>
      <div class="sl-tray" data-tray></div>
      <div class="cl-controls" data-controls></div>
      <div class="cl-foot">
        <button type="button" class="pk-link" data-dice-history>${esc(tr('diceHistory', 'Dice history'))}</button>
        <button type="button" class="pk-link" data-rules>${esc(tr('rules', 'Rules'))}</button>
        <button type="button" class="pk-link" data-prefs>${esc(tr('settings', 'Settings'))}</button>
      </div>
    </div>`);
    const g = { st: clone(o.st), disp: null, lastSeq: o.st.seq, queue: Promise.resolve(), busy: false, destroyed: false };
    g.disp = g.st.seats.map((s) => s.pos);
    const tokensEl = body.querySelector('[data-tokens]');
    const tokenEls = g.st.seats.map((s, i) => {
      const tk = S.TOKENS[i];
      const el = document.createElement('span');
      el.className = 'sl-token';
      el.innerHTML = K.shapeSvg(tk.shape, tk.hex, 22);
      tokensEl.appendChild(el);
      return el;
    });
    const speedy = () => !!g.st.settings.speed;
    const wait = (n) => K.sleep(speedy() ? Math.round(K.ms(n) * 0.5) : K.ms(n));

    function place(jumping) {
      const groups = {};
      g.disp.forEach((p, i) => (groups[p] = groups[p] || []).push(i));
      Object.keys(groups).forEach((p) => {
        const list = groups[p];
        list.forEach((i, k) => {
          const el = tokenEls[i];
          el.classList.toggle('is-jumping', !!jumping && jumping.indexOf(i) >= 0);
          if (Number(p) < 1) {
            el.hidden = true;
            return;
          }
          el.hidden = false;
          const [r, c] = S.cellOf(Number(p));
          const n = list.length;
          const off = n > 1 ? (k - (n - 1) / 2) * 0.22 : 0;
          el.style.left = ((c + 0.5 + off) / 10) * 100 + '%';
          el.style.top = ((r + 0.55 + (n > 1 ? off * 0.5 : 0)) / 10) * 100 + '%';
        });
      });
      const tray = body.querySelector('[data-tray]');
      const waiting = g.disp.map((p, i) => (p < 1 ? i : -1)).filter((i) => i >= 0);
      tray.innerHTML = waiting.length
        ? `<span class="cl-note">${esc(tr('start', 'Start'))}</span>` + waiting.map((i) => K.shapeSvg(S.TOKENS[i].shape, S.TOKENS[i].hex, 20)).join('')
        : '';
    }

    const mine = () => o.mine(g.st);
    const myTurn = () => !g.st.over && mine().indexOf(g.st.turn) >= 0;

    function paintPlayers() {
      const me = mine();
      body.querySelector('[data-players]').innerHTML = g.st.seats
        .map((s, i) => {
          const tk = S.TOKENS[i];
          const tags = [];
          if (me.indexOf(i) >= 0 && (o.live || me.length === 1)) tags.push(tr('you', 'You'));
          if (s.bot) tags.push(s.forfeit ? tr('botPlaying', 'Bot playing') : tr('bot', 'Bot'));
          return `<div class="cl-player${i === g.st.turn && !g.st.over ? ' is-turn' : ''}${s.forfeit ? ' is-out' : ''}">${K.shapeSvg(tk.shape, tk.hex, 18)}<span class="cl-player-name">${esc(s.name)}</span>${tags
            .map((x) => `<span class="cl-tag">${esc(x)}</span>`)
            .join('')}<span class="cl-player-meta">${s.place ? esc(K.placeLabel(s.place)) : s.pos ? s.pos : '—'}</span></div>`;
        })
        .join('');
    }
    function setBanner(text, tone) {
      const el = body.querySelector('[data-banner]');
      el.textContent = text;
      el.dataset.tone = tone || '';
    }
    function turnText() {
      if (g.st.over) return tr('over', 'Game over');
      const seat = g.st.seats[g.st.turn];
      if (myTurn()) return mine().length > 1 && !o.live ? seat.name + ' — ' + tr('rollNow', 'roll the die') : tr('yourRoll', 'Your turn — roll the die');
      return seat.name + (seat.bot ? ' (' + tr('bot', 'Bot') + ')' : '') + ' — ' + tr('rolling', 'to roll');
    }
    function paintControls() {
      const el = body.querySelector('[data-controls]');
      if (g.st.over) {
        el.innerHTML = '';
        if (o.onOver) o.onOver(g.st, el);
        return;
      }
      const canRoll = myTurn() && !g.busy;
      el.innerHTML = `<div class="cl-dice-row-main">${K.diceHtml({ value: g.st.dice, canRoll, waitLabel: myTurn() ? '' : tr('waiting', 'Waiting') })}${o.controlsExtra ? o.controlsExtra(g.st) : ''}</div>`;
      el.querySelector('[data-roll]')?.addEventListener('click', (e) => {
        if (!myTurn() || g.busy) return;
        e.currentTarget.disabled = true;
        e.currentTarget.querySelector('[data-die-art]')?.classList.add('is-rolling');
        g.busy = true;
        o.onRoll();
      });
      if (o.wireControls) o.wireControls(el);
    }
    function paint() {
      if (g.destroyed || shell.closed) return;
      place();
      paintPlayers();
      setBanner(turnText(), myTurn() ? 'you' : '');
      paintControls();
      if (o.afterPaint) o.afterPaint(g.st);
    }

    async function play(events) {
      for (const e of events) {
        if (g.destroyed || shell.closed) return;
        const seat = g.st.seats[e.seat];
        const name = seat ? seat.name : '';
        if (e.type === 'roll') {
          const host = body.querySelector('[data-controls]');
          if (!host.querySelector('[data-die-art]')) host.innerHTML = `<div class="cl-dice-row-main">${K.diceHtml({ value: 0, canRoll: false })}</div>`;
          if (!speedy()) await K.animateDie(host, e.value);
          else {
            K.fx('roll');
            const art = host.querySelector('[data-die-art]');
            if (art) art.innerHTML = K.dieFaceSvg(e.value);
          }
          const lbl = host.querySelector('.cl-die-label');
          if (lbl) lbl.textContent = name + ' · ' + e.value;
          setBanner(name + ' ' + tr('rolled', 'rolled') + ' ' + e.value);
        } else if (e.type === 'move') {
          if (e.overshoot === 'stay') {
            setBanner(name + ' — ' + tr('needExact', 'needs an exact roll to reach 100'));
            await wait(600);
            continue;
          }
          const steps = [];
          let p = e.from;
          if (e.overshoot === 'bounce') {
            while (p < 100) steps.push(++p);
            while (p > e.to) steps.push(--p);
          } else while (p < e.to) steps.push(++p);
          for (const q of steps) {
            g.disp[e.seat] = q;
            place();
            K.fx('hop');
            await wait(130);
          }
          if (e.jump) {
            const up = e.jump.kind === 'ladder';
            const lab = Core().boardById(g.st.board).labels[e.jump.from];
            setBanner(name + ' ' + (up ? tr('climbed', 'climbed a ladder to') : tr('slid', 'slid down a snake to')) + ' ' + e.jump.to + (lab ? ' · ' + lab : ''), up ? 'good' : 'warn');
            K.fx(up ? 'climb' : 'slide');
            await wait(160);
            g.disp[e.seat] = e.jump.to;
            place([e.seat]);
            await wait(650);
            place();
          }
        } else if (e.type === 'triple_six') {
          K.fx('invalid');
          setBanner(tr('tripleSix', 'Three 6s in a row — turn lost'), 'warn');
          await wait(800);
        } else if (e.type === 'bonus') {
          setBanner(name + ' — ' + tr('bonusSix', 'rolled a 6, roll again'));
          await wait(250);
        } else if (e.type === 'takeover') {
          toast(name + ' — ' + (e.reason === 'afk' ? tr('takeoverAfk', 'a bot took over after missed turns') : tr('takeoverLeft', 'left; a bot is playing the seat')));
        } else if (e.type === 'finished') {
          K.fx('home');
          setBanner(name + ' ' + tr('reached', 'reached 100!'), 'good');
          await wait(600);
        }
      }
    }

    body.querySelector('[data-dice-history]').addEventListener('click', () =>
      K.openDiceSheet({ game: GAME, live: !!o.live, seats: g.st.seats.map((s, i) => ({ name: s.name, color: S.TOKENS[i].hex, shape: S.TOKENS[i].shape, rolls: g.st.rolls[i] || [] })) })
    );
    body.querySelector('[data-rules]').addEventListener('click', () => {
      if (window.DangalRules) DangalRules.openSheet(GAME, { variants: { board: g.st.settings.board, exact: g.st.settings.exact, speed: g.st.settings.speed } });
    });
    body.querySelector('[data-prefs]').addEventListener('click', () => K.openPrefsSheet(['sound', 'haptics', 'speed'], () => paint()));
    paint();

    return {
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
            g.disp = st.seats.map((s) => s.pos);
            g.busy = false;
            paint();
          });
        return g.queue;
      },
      unlock() {
        g.busy = false;
        paint();
      },
      destroy() {
        g.destroyed = true;
      },
    };
  }

  function rankingHtml(st, extra) {
    const S = Core();
    const K = CK();
    return `<div class="cl-ranking">${(st.ranking || [])
      .map((si, k) => {
        const s = st.seats[si];
        const tk = S.TOKENS[si];
        return `<div class="cl-rank-row${k === 0 ? ' is-first' : ''}"><span class="cl-rank-place">${esc(K.placeLabel(k + 1))}</span>${K.shapeSvg(tk.shape, tk.hex, 18)}<span class="cl-rank-name">${esc(s.name)}${
          s.forfeit ? ' · ' + esc(tr('forfeited', 'forfeited')) : ''
        }</span><span class="cl-rank-meta">${s.pos}</span>${extra ? extra(s) : ''}</div>`;
      })
      .join('')}</div>`;
  }

  // ---------------- settings UI ----------------

  function settingsHtml(s, withSeats) {
    const K = Kit();
    const S = Core();
    return `<div class="cl-setup">
      ${withSeats || ''}
      <div class="cl-sub">${esc(tr('board', 'Board'))}</div>
      <div class="sl-boards">${S.BOARDS.map(
        (b) => `<button type="button" class="sl-board-pick${b.id === s.board ? ' is-on' : ''}" data-board="${b.id}"><b>${esc(boardName(b.id))}</b><small>${esc(tr('boardDesc.' + b.id, b.desc))}</small></button>`
      ).join('')}</div>
      <details class="cl-advanced"><summary>${esc(tr('more', 'More options'))}</summary>
        <div class="cl-sub">${esc(tr('exact', 'Rolling past 100'))}</div>
        ${K.segHtml('exact', s.exact, [['stay', tr('stay', 'Stay put')], ['bounce', tr('bounce', 'Bounce back')]])}
        <label class="cl-pref"><span>${esc(tr('speedMode', 'Speed mode — auto-roll and fast animations'))}</span><input type="checkbox" data-opt="speed" ${s.speed ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('places', 'Keep playing for 2nd and 3rd place'))}</span><input type="checkbox" data-opt="places" ${s.places ? 'checked' : ''}></label>
        <p class="cl-note">${esc(tr('fixed', 'Always on: a 6 rolls again, three 6s in a row lose the turn.'))}</p>
      </details>
    </div>`;
  }
  function wireSettings(el, s) {
    el.querySelectorAll('[data-board]').forEach((btn) =>
      btn.addEventListener('click', () => {
        s.board = btn.dataset.board;
        el.querySelectorAll('[data-board]').forEach((b) => b.classList.toggle('is-on', b === btn));
      })
    );
    el.querySelectorAll('[data-seg="exact"]').forEach((seg) => Kit().wireSegs(seg.parentNode, s, () => {}));
    el.querySelectorAll('[data-opt]').forEach((box) => box.addEventListener('change', () => (s[box.dataset.opt] = box.checked)));
  }

  // ---------------- local ----------------

  function loadSetup() {
    const d = { count: 2, seats: [{ kind: 'human', name: '' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }], rules: Object.assign({}, Core().DEFAULTS) };
    const s = Object.assign(d, CK().readJson(SETUP_KEY, {}));
    s.rules = Core().mergeSettings(s.rules);
    while (s.seats.length < 6) s.seats.push({ kind: 'bot' });
    s.count = Math.max(2, Math.min(6, Number(s.count) || 2));
    return s;
  }
  const myName = () => (Kit() && Kit().myName()) || tr('you', 'You');

  function openSetup(kind, onDone) {
    const K = Kit();
    const S = Core();
    const s = loadSetup();
    if (kind === 'pass') s.seats = s.seats.map((x, i) => ({ kind: 'human', name: x.kind === 'human' && x.name ? x.name : i === 0 ? myName() : tr('player', 'Player') + ' ' + (i + 1) }));
    else s.seats = s.seats.map((x, i) => (i === 0 ? { kind: 'human', name: myName() } : x));
    const seatView = () => s.seats.slice(0, s.count).map((x, i) => ({ kind: x.kind, name: x.kind === 'bot' ? tr('bot', 'Bot') : x.name || tr('player', 'Player') + ' ' + (i + 1), color: S.TOKENS[i].hex, shape: S.TOKENS[i].shape }));
    K.openSheet({
      title: kind === 'pass' ? tr('passTitle', 'Pass & Play') : tr('botsTitle', 'Play vs bots'),
      bodyHtml: settingsHtml(s.rules, `<div class="cl-sub">${esc(tr('players', 'Players'))}</div><div data-count-seg></div><div data-seats></div>`) + `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('startGame', 'Start'))}</button>`,
      onMount(el, close) {
        const paintSeats = () => {
          el.querySelector('[data-count-seg]').innerHTML = K.segHtml('count', s.count, [2, 3, 4, 5, 6].map((n) => [n, String(n)]));
          K.wireSegs(el.querySelector('[data-count-seg]'), s, () => paintSeats());
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
        wireSettings(el, s.rules);
        el.querySelector('[data-go]').addEventListener('click', () => {
          CK().writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onDone(s), 80);
        });
      },
    });
  }

  function startLocal(setup, kind) {
    const K = Kit();
    const S = Core();
    const C = CK();
    let botN = 0;
    const players = setup.seats.slice(0, setup.count).map((x, i) =>
      x.kind === 'bot' ? { id: 'b' + i, name: tr('bot', 'Bot') + ' ' + ++botN, bot: true } : { id: 'p' + i, name: x.name || (i === 0 ? myName() : tr('player', 'Player') + ' ' + (i + 1)) }
    );
    if (!players.some((p) => !p.bot)) players[0] = { id: 'p0', name: myName() };
    const st = S.newGame(players, setup.rules);
    if (st.error) return toast(tr('needPlayers', 'Snakes & Ladders needs 2–6 players'));
    const rng = C.seededRng(C.newSeed());
    const humans = st.seats.map((s, i) => i).filter((i) => !st.seats[i].bot);
    let timer = null;
    let recorded = false;
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: humans.length > 1 ? tr('passTitle', 'Pass & Play') : tr('practice', 'Practice vs bots'),
      confirmLeave: () => !st.over,
      leaveBody: tr('leaveLocal', 'This game will end.'),
      onClose: () => clearTimeout(timer),
    });
    const view = mountGame(shell, {
      st,
      mine: (s) => s.seats.map((x, i) => i).filter((i) => !s.seats[i].bot),
      onRoll() {
        S.roll(st, rng.die());
        view.update(st);
      },
      afterPaint(shown) {
        clearTimeout(timer);
        if (st.over || shown.seq !== st.seq || shell.closed) return;
        const seat = st.seats[st.turn];
        if (seat.bot || st.settings.speed) {
          timer = setTimeout(() => {
            if (shell.closed || st.over) return;
            S.roll(st, rng.die());
            view.update(st);
          }, C.ms(seat.bot ? 650 : 900));
        }
      },
      onOver(shown, el) {
        if (!recorded) {
          recorded = true;
          C.recordPracticeRolls(humans.reduce((a, i) => a.concat(st.rolls[i] || []), []));
          const won = humans.length === 1 && st.ranking[0] === humans[0];
          C.fx(humans.length > 1 || won ? 'win' : 'lose');
          if (humans.length === 1 && typeof recordGameResult === 'function') recordGameResult(GAME, !!won);
        }
        const line = st.seats[st.ranking[0]].name + ' ' + tr('wins', 'wins!');
        el.innerHTML = `<div class="cl-result"><div class="cl-result-title">${esc(line)}</div>${rankingHtml(shown)}
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-share>${esc(tr('share', 'Share'))}</button><button type="button" class="pk-btn pk-btn--ghost" data-setup>${esc(tr('changeSetup', 'Change setup'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(setup, kind)));
        el.querySelector('[data-setup]').addEventListener('click', () => K.closeThen(shell, () => openSetup(kind, (s) => startLocal(s, kind))));
        el.querySelector('[data-share]').addEventListener('click', () => C.shareWin(GAME, LABEL, line + ' · ' + boardName(st.board)));
      },
    });
  }

  // ---------------- Live room ----------------

  function roomDefaults() {
    return Object.assign({ bots: 0, stake: 0 }, Core().DEFAULTS, CK().readJson(ROOM_KEY, {}));
  }
  function lobbySummary(ctrl) {
    const s = Core().mergeSettings((ctrl.view.pub && ctrl.view.pub.settings) || {});
    const raw = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const bits = [settingsLine(s)];
    if (raw.bots) bits.push(raw.bots + ' ' + (raw.bots === 1 ? tr('botOne', 'bot') : tr('botMany', 'bots')));
    bits.push(CK().stakeLabel(Number(raw.stake) || 0));
    return bits.join(' · ');
  }
  function openRoomSettings(ctrl) {
    const K = Kit();
    const cur = Object.assign({}, roomDefaults(), (ctrl.view.pub && ctrl.view.pub.settings) || {});
    const humans = ctrl.players().length;
    K.openSheet({
      title: tr('roomSettings', 'Room settings'),
      bodyHtml:
        settingsHtml(
          cur,
          `<div class="cl-sub">${esc(tr('fillBots', 'Fill empty seats with bots'))}</div><div data-bots-seg>${K.segHtml('bots', cur.bots, [0, 1, 2, 3, 4, 5].filter((n) => n === 0 || n + humans <= 6).map((n) => [n, String(n)]))}</div>
           <div class="cl-sub">${esc(tr('stake', 'Stake'))}</div><div data-stake-seg>${K.segHtml('stake', cur.stake, CK().STAKES.map((n) => [n, n ? '⚡' + n : tr('friendly', 'Friendly')]))}</div>
           <p class="cl-note">${esc(tr('payouts', 'Everyone antes the stake. 2 players: winner takes both. 3: 70% / 30%. 4: 60% / 30% / 10%. 5–6: 50% / 30% / 20%. Virtual chips only.'))}</p>`
        ) + `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>`,
      onMount(el, close) {
        K.wireSegs(el.querySelector('[data-bots-seg]'), cur, () => {});
        K.wireSegs(el.querySelector('[data-stake-seg]'), cur, () => {});
        wireSettings(el, cur);
        el.querySelector('[data-save]').addEventListener('click', async () => {
          CK().writeJson(ROOM_KEY, cur);
          const out = await ctrl.act('settings', { settings: cur });
          if (out) close();
        });
      },
    });
  }
  function lobbyListHtml(ctrl, players) {
    const pub = ctrl.view.pub;
    const s = pub.settings || {};
    const bots = Math.max(0, Math.min(Number(s.bots) || 0, 6 - players.length));
    const rows = players.map(
      (p) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${p.id === pub.host ? '<span class="pk-badge">Host</span>' : ''}${
        p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">You</span>' : ''
      }</div>`
    );
    for (let i = 0; i < bots; i++) rows.push(`<div class="pk-lobby-row is-bot"><span class="pk-dot is-online"></span><span>🤖 ${esc(tr('bot', 'Bot') + ' ' + (i + 1))}</span></div>`);
    return `<div class="pk-lobby-list">${rows.join('')}</div><p class="cl-note">${esc(tr('chance', 'A game of chance — every roll comes from our server.'))}</p>`;
  }
  function canStart(ctrl, players) {
    const s = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const total = players.length + Math.max(0, Math.min(Number(s.bots) || 0, 6 - players.length));
    return total < 2 ? { ok: false, label: tr('addBotOrFriend', 'Add a bot or invite a friend') } : { ok: true, label: tr('startGame', 'Start') };
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const m = ctrl.sl;
    if (m && m.round === pub.roundNo && ctrl.shell.body.querySelector('[data-sl-board]')) {
      m.view.update(st);
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
      controlsExtra: () => '<span class="cl-timer pk-timer" data-timer></span>',
      wireControls: (el) => ctrl.wire(el),
      afterPaint(shown) {
        clearTimeout(autoTimer);
        if (shown.over || !shown.settings.speed || mine(shown).indexOf(shown.turn) < 0) return;
        autoTimer = setTimeout(async () => {
          const out = await ctrl.act('roll');
          if (!out) view.unlock();
        }, CK().ms(900));
      },
      onOver(shown, el) {
        const set = ctrl.view.pub.settlement;
        const results = (set && set.results) || {};
        const me = shown.seats.findIndex((x) => x.id === ctrl.uid);
        if (ctrl.sl && !ctrl.sl.fxDone) {
          ctrl.sl.fxDone = true;
          const won = me >= 0 && shown.ranking[0] === me;
          CK().fx(won ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, !!won);
        }
        const chip = (s) => {
          const r = results[s.id];
          if (!r || !r.chipDelta) return set && set.status === 'pending' && !s.bot ? '<span class="cl-rank-chips">…</span>' : '';
          return `<span class="cl-rank-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta}</span>`;
        };
        const line = shown.seats[shown.ranking[0]].name + ' ' + tr('wins', 'wins!');
        el.innerHTML = `<div class="cl-result"><div class="cl-result-title">${esc(line)}</div>${rankingHtml(shown, chip)}${Kit().roomResultActions(ctrl, {
          nextLabel: tr('rematch', 'Rematch'),
          waitLabel: tr('waitRematch', 'Waiting for the host to start a rematch…'),
        })}</div>`;
        Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, line + ' · ' + boardName(shown.board)) });
      },
    });
    ctrl.sl = { round: pub.roundNo, view, fxDone: false };
  }

  function openRoom(code, opts) {
    return Kit().openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!(opts && opts.join),
      min: 1,
      max: 6,
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
    const setup = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Board') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🐍'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'A game of chance: roll, climb ladders, dodge snakes, first to 100 wins.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bots"><span class="pk-mode-title">${esc(tr('botsTitle', 'Play vs bots'))}</span><span class="pk-mode-sub">${esc(setup.count + ' ' + tr('players', 'players') + ' · ' + settingsLine(setup.rules))}</span></button>
        <button type="button" class="pk-mode" data-go="friends"><span class="pk-mode-title">${esc(tr('friendsTitle', 'Play with friends'))}</span><span class="pk-mode-sub">${esc(tr('friendsSub', '2–6 players on their own phones · bots can fill seats'))}</span></button>
        <button type="button" class="pk-mode" data-go="pass"><span class="pk-mode-title">${esc(tr('passTitle', 'Pass & Play'))}</span><span class="pk-mode-sub">${esc(tr('passSub', 'One phone, pass it around'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
          <button type="button" class="pk-link" data-go="setup">${esc(tr('changeSetup', 'Change setup'))}</button>
          <button type="button" class="pk-link" data-go="dice">${esc(tr('diceHistory', 'Dice history'))}</button>
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
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Snakes & Ladders is still loading — try again'));
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
      id: 'snakes',
      name: 'Snakes & Ladders',
      desc: '2–6 players · 4 boards · bots · Live rooms with server dice',
      icon: '🐍',
      ratingKey: 'snakes',
      gameType: 'multiplayer',
      genre: 'board',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      chatGroup: true,
      selfChat: true,
      ownHome: true,
      order: 20,
      meta: {
        core: 'snakes-core.js (100-square rules, 4 validated boards, shared with the server)',
        live: 'party_room → server-lib/classics-rooms.js; server CSPRNG dice, bot takeover, placement chips',
      },
      launch: openGame,
    });
  }

  window.SnakesGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom) };
  window.openSnakesVersionPicker = function () {
    openGame({ source: 'manch', mode: 'home' });
  };
  window.openSnakesGame = window.openSnakesVersionPicker;
})();
