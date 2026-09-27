/**
 * Dumb Charades — Dangal party game (G2) on the Party Kit. Two teams; the actor mimes a title, no talking.
 *   Pass & Play: one phone, offline, no sign-in — CharadesCore runs locally; the actor peeks at the
 *                title, then holds a big countdown with Got it / Pass that never shows the answer.
 *   Room ("Together or on a video call"): only the actor's secrets node holds the title
 *                (server-lib/party-deal.js); teammates may type guesses that auto-credit the team.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'charades';
  const LABEL = 'Dumb Charades';
  const SETTINGS_KEY = 'chaupaal_charades_settings';
  const TEAMS_KEY = 'chaupaal_charades_teams';

  const Core = () => window.CharadesCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  const KIND = {
    movie: '🎥 Movie',
    song: '🎵 Song',
    tv: '📺 TV show',
    person: '🧑 Famous person',
    phrase: '💬 Saying',
    action: '🏃 Action',
  };

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  function isHi() {
    return String(lang()).indexOf('hi') === 0;
  }

  function packLabel(p) {
    return p ? (isHi() ? p.hi + ' · ' + p.en : p.en) : '';
  }

  function loadSettings() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (e) {}
    const s = Core().mergeSettings(raw);
    if (!s.categories) s.categories = Core().packs.defaultCategories(lang());
    return s;
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadTeams() {
    try {
      const raw = JSON.parse(localStorage.getItem(TEAMS_KEY) || 'null');
      if (Array.isArray(raw) && raw.length === 2 && raw.every((t) => Array.isArray(t) && t.length >= 2)) return raw;
    } catch (e) {}
    return [[Kit().myName() || '', ''], ['', '']];
  }

  function saveTeams(teams) {
    try {
      localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
    } catch (e) {}
  }

  function goalLine(s) {
    return s.goal === 'points' ? 'First to ' + s.targetPoints : s.turnsPerTeam + ' turns each';
  }

  function metaLine(s) {
    const cats = (s.categories || []).length;
    return s.turnSec + 's · ' + (s.passes === 1 ? '1 pass' : s.passes + ' passes') + ' · ' + goalLine(s) + (s.speed ? ' · Speed round' : '') + ' · ' + cats + (cats === 1 ? ' category' : ' categories');
  }

  // ---------------- how-to + gestures ----------------

  function gesturesHtml() {
    return `<div class="ch-gestures">${Core()
      .GESTURES.map((g) => `<div class="ch-gesture"><span aria-hidden="true">${esc(g.icon)}</span><strong>${esc(g.en)}</strong><span>${esc(g.how)}</span></div>`)
      .join('')}</div>`;
  }

  function howToCardHtml() {
    return `<details class="pk-howto">
      <summary>How to play · 20 seconds</summary>
      <ol>
        <li>Split into <strong>two teams</strong>. Teams take turns.</li>
        <li>The actor secretly sees a title and acts it out — <strong>no talking, no mouthing</strong>.</li>
        <li>Teammates shout guesses before the timer ends. Actor taps <strong>Got it ✓</strong> for +1.</li>
        <li>Stuck? <strong>Pass</strong> for a new title (1 per turn by default).</li>
      </ol>
      <div class="pk-howto-score">Gesture cheat sheet</div>
      ${gesturesHtml()}
    </details>`;
  }

  function openGestures() {
    Kit().openSheet({ title: 'Gestures', bodyHtml: gesturesHtml() + '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-ok>Got it</button>', onMount: (sheet, close) => sheet.querySelector('[data-ok]').addEventListener('click', close) });
  }

  /** The actor's private title card. */
  function titleCardHtml(t, extra) {
    if (!t) return '<div class="ch-card ch-card--empty">Dealing…</div>';
    const pack = Core().packs.getPack(t.pack);
    const primary = isHi() ? t.hi || t.en : t.en;
    const secondary = isHi() ? t.en : t.hi;
    return `<div class="ch-card">
      <div class="ch-card-kind">${esc(KIND[t.kind] || '🎭')} · ${esc(pack ? packLabel(pack) : '')}</div>
      <div class="ch-card-title">${esc(primary)}</div>
      ${secondary && secondary !== primary ? `<div class="ch-card-alt">${esc(secondary)}</div>` : ''}
      <div class="ch-card-diff ch-card-diff--${esc(t.difficulty)}">${esc(t.difficulty)}</div>
      ${extra || '<div class="ch-card-tip">Act it out — no talking!</div>'}
    </div>`;
  }

  function titleText(t) {
    return t ? (isHi() ? t.hi || t.en : t.en) : '';
  }

  // ---------------- settings ----------------

  function openCategoryPicker(current, onSave) {
    const sel = new Set(current || []);
    const P = Core().packs;
    Kit().openSheet({
      title: 'Categories',
      bodyHtml: `<div class="im-packs ch-cats">${P.PACKS.map(
        (p) => `<label class="im-pack ch-cat"><input type="checkbox" data-cat="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}>
          <span class="im-pack-icon" aria-hidden="true">${esc(p.icon)}</span>
          <span class="im-pack-name">${esc(packLabel(p))}</span>
          <span class="im-pack-count">${p.titles.length}</span></label>`
      ).join('')}</div>
      <div class="pk-field-help" data-cat-err></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          const ids = Array.from(sheet.querySelectorAll('[data-cat]:checked')).map((el) => el.dataset.cat);
          if (!ids.length) {
            sheet.querySelector('[data-cat-err]').textContent = 'Pick at least one category';
            return;
          }
          close();
          onSave(ids);
        });
      },
    });
  }

  function openSettings(settings, opts) {
    const s = Object.assign({}, settings);
    const K = Kit();
    const C = Core();
    K.openSheet({
      title: 'Game settings',
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">Time per turn</div>
          ${K.segHtml('turnSec', s.turnSec, C.TURN_SEC.map((v) => [v, v + 's']))}
        </div>
        <div class="pk-field">
          <div class="pk-field-label">Game length</div>
          ${K.segHtml('goal', s.goal, [['turns', 'Turns each'], ['points', 'First to…']])}
          <div data-goal-turns>${K.segHtml('turnsPerTeam', s.turnsPerTeam, C.TURNS_PER_TEAM.map((v) => [v, String(v)]))}</div>
          <div data-goal-points>${K.segHtml('targetPoints', s.targetPoints, C.TARGETS.map((v) => [v, v + ' pts']))}</div>
        </div>
        <button type="button" class="im-pack-row" data-cats>🗂️ Categories: <strong data-cats-n>${(s.categories || []).length}</strong> <span class="im-chev">›</span></button>
        <details class="pk-advanced">
          <summary>Advanced</summary>
          <div class="pk-field">
            <div class="pk-field-label">Passes per turn</div>
            ${K.segHtml('passes', s.passes, [[0, 'None'], [1, '1'], [2, '2'], [3, '3']])}
          </div>
          <div class="pk-field">
            <label class="pk-toggle"><input type="checkbox" data-speed ${s.speed ? 'checked' : ''}> Speed round — chain titles until time runs out</label>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">Difficulty</div>
            ${K.segHtml('difficulty', s.difficulty, [['all', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']])}
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        const paintGoal = () => {
          sheet.querySelector('[data-goal-turns]').hidden = s.goal !== 'turns';
          sheet.querySelector('[data-goal-points]').hidden = s.goal !== 'points';
        };
        paintGoal();
        K.wireSegs(sheet, s, (key) => key === 'goal' && paintGoal());
        sheet.querySelector('[data-speed]').addEventListener('change', (e) => (s.speed = !!e.target.checked));
        sheet.querySelector('[data-cats]').addEventListener('click', () =>
          openCategoryPicker(s.categories, (ids) => {
            s.categories = ids;
            const n = sheet.querySelector('[data-cats-n]');
            if (n) n.textContent = String(ids.length);
          })
        );
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          close();
          opts.onSave(C.mergeSettings(s));
        });
      },
    });
  }

  function scoreStripHtml(st, settings, nm) {
    return `<div class="ch-scores">${[0, 1]
      .map(
        (i) => `<div class="ch-score ch-score--${i}${st.team === i && (st.phase === 'ready' || st.phase === 'acting') ? ' is-active' : ''}">
          <span class="ch-score-name">${esc(Core().teamName(settings, i))}</span>
          <span class="ch-score-pts">${st.teamScores[i]}</span>
        </div>`
      )
      .join('')}</div>`;
  }

  function turnSummaryHtml(last, settings, nm) {
    if (!last) return '';
    const got = last.got.map((t) => `<div class="ch-title-row is-got">✓ ${esc(titleText(t))}${t.by && t.by !== last.actor ? ` <em>· ${esc(nm(t.by))}</em>` : ''}</div>`).join('');
    const passed = last.passed.map((t) => `<div class="ch-title-row is-passed">↷ ${esc(titleText(t))}</div>`).join('');
    const missed = last.missed ? `<div class="ch-title-row is-missed">⏱ ${esc(titleText(last.missed))}</div>` : '';
    const head =
      last.reason === 'got' ? 'Got it! +1' : last.reason === 'left' ? 'The actor left' : last.points ? 'Time’s up! +' + last.points : 'Time’s up!';
    return `<div class="ch-summary">
      <div class="pk-result-title">${esc(head)}</div>
      <div class="pk-sub">${esc(nm(last.actor))} acted for ${esc(Core().teamName(settings, last.team))}</div>
      <div class="ch-titles">${got}${passed}${missed}</div>
    </div>`;
  }

  function finalHtml(st, settings, nm) {
    const title = st.winner === -1 ? 'It’s a tie!' : Core().teamName(settings, st.winner) + ' win!';
    return `<div class="ch-final">
      <div class="pk-result-glyph" aria-hidden="true">${st.winner === -1 ? '🤝' : '🏆'}</div>
      <div class="pk-result-title">${esc(title)}</div>
      <div class="ch-final-score">${st.teamScores[0]} – ${st.teamScores[1]}</div>
      ${st.mvp ? `<div class="ch-mvp">🎭 MVP actor: <strong>${esc(nm(st.mvp))}</strong></div>` : ''}
      ${scoreStripHtml(st, settings, nm)}
    </div>`;
  }

  function shareFinal(st, settings, nm) {
    const hi = Math.max(st.teamScores[0], st.teamScores[1]);
    const lo = Math.min(st.teamScores[0], st.teamScores[1]);
    const score = hi + '–' + lo;
    const head = st.winner === -1 ? 'Dumb Charades ended in a ' + score + ' tie' : Core().teamName(settings, st.winner) + ' won Dumb Charades ' + score;
    Kit().shareLine(GAME, LABEL, head + (st.mvp ? ' · MVP actor ' + nm(st.mvp) : '') + ' 🎭');
  }

  // ---------------- entry ----------------

  function open(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast(LABEL + ' is still loading — try again');
      return;
    }
    if ((c.source === 'chat_group' || c.isGroup) && c.chat) {
      startRoom({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: 'Party', confirmLeave: () => false });
    renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '🎭',
        title: 'Act it out. No talking.',
        sub: '4–16 players · two teams · movies, songs, shows & more',
        howToHtml: howToCardHtml(),
        roomSub: 'Together or on a video call',
      })
    );
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => Kit().closeThen(shell, () => startRoom({})));
    body.querySelector('[data-mode="join"]').addEventListener('click', () =>
      Kit().closeThen(shell, () => Kit().openJoinSheet((code) => openRoom(code, { join: true })))
    );
  }

  // ======================= PASS & PLAY =======================

  function renderPassSetup(shell) {
    const settings = loadSettings();
    const body = shell.render(`<div class="pk-page">
      <div class="pk-setup-head">
        <div class="pk-title">Pick teams</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="Game settings">⚙︎</button>
      </div>
      <div data-editor></div>
      <div class="pk-meta" data-meta></div>
      <div class="im-error" data-err role="alert"></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>Start</button>
    </div>`);
    const editor = Kit().mountTeamEditor(body.querySelector('[data-editor]'), {
      teams: loadTeams(),
      teamNames: Core().TEAM_NAMES,
      minPerTeam: Core().MIN_PER_TEAM,
      max: Core().MAX_PLAYERS,
    });
    const paintMeta = () => {
      const meta = body.querySelector('[data-meta]');
      if (meta) meta.textContent = metaLine(settings);
    };
    paintMeta();
    body.querySelector('[data-settings]').addEventListener('click', () =>
      openSettings(settings, {
        onSave: (s) => {
          Object.assign(settings, s);
          saveSettings(settings);
          paintMeta();
        },
      })
    );
    body.querySelector('[data-start]').addEventListener('click', () => {
      const names = editor.list();
      if (names[0].length < 2 || names[1].length < 2) {
        body.querySelector('[data-err]').textContent = 'Each team needs at least 2 players';
        return;
      }
      saveTeams(names);
      let n = 0;
      const players = {};
      const teams = names.map((t) =>
        t.map((name) => {
          const id = 'p' + n++;
          players[id] = name;
          return id;
        })
      );
      const game = Core().createGame(teams, settings, { lang: lang() });
      const session = { players, settings: game.settings, pub: game.pub, hidden: game.hidden };
      renderPassReady(shell, session);
    });
  }

  function passNm(session) {
    return (id) => session.players[id] || 'Someone';
  }

  function passAct(session, action) {
    const out = Core().applyAction(session.pub, session.hidden, session.settings, action);
    if (out.error) return null;
    session.pub = out.pub;
    return out;
  }

  function routePass(shell, session) {
    const p = session.pub.phase;
    if (p === 'ready') renderPassReady(shell, session);
    else if (p === 'acting') renderPassActing(shell, session);
    else if (p === 'turnEnd') renderPassTurnEnd(shell, session);
    else if (p === 'over') renderPassOver(shell, session);
  }

  function renderPassReady(shell, session) {
    const nm = passNm(session);
    const st = session.pub;
    shell.setSubtitle('Turn ' + st.turnNo);
    const body = shell.render(`<div class="pk-page">
      ${scoreStripHtml(st, session.settings, nm)}
      <div class="pk-progress">${esc(Core().teamName(session.settings, st.team))} · actor</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      lead: 'Hand the phone to',
      name: nm(st.actor),
      revealHtml: () => titleCardHtml(Core().reveal(session.hidden.current)),
      doneLabel: 'Start timer ▶',
      onDone: () => {
        passAct(session, { type: 'start' });
        renderPassActing(shell, session);
      },
    });
  }

  function renderPassActing(shell, session, notice) {
    const nm = passNm(session);
    const st = session.pub;
    const s = session.settings;
    if (!session.clock || session.clockTurn !== st.turnNo) {
      if (session.clock) session.clock.stop();
      session.clockTurn = st.turnNo;
      session.endsAt = Date.now() + s.turnSec * 1000;
      session.pausedLeft = null;
    }
    const body = shell.render(`<div class="pk-page ch-acting">
      ${scoreStripHtml(st, s, nm)}
      <div class="pk-progress">${esc(nm(st.actor))} is acting · no talking!</div>
      <div class="pk-timer ch-timer" data-timer></div>
      ${s.speed ? `<div class="ch-counter">Got ${st.turnGot.length} this turn</div>` : ''}
      ${notice ? `<div class="ch-notice" role="status">${esc(notice)}</div>` : ''}
      <button type="button" class="ch-got" data-got>Got it ✓</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-pass ${st.passesLeft > 0 ? '' : 'disabled'}>Pass${s.passes ? ' (' + st.passesLeft + ' left)' : ''}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-pause>${session.pausedLeft != null ? 'Resume' : 'Pause'}</button>
      </div>
      <button type="button" class="pk-peek${notice ? ' is-nudge' : ''}" data-peek aria-label="Actor: hold to see the title">👁 Actor: hold to see the title</button>
      <button type="button" class="pk-link" data-gestures>? Gestures</button>
    </div>`);
    const timerEl = body.querySelector('[data-timer]');
    session.clock = Kit().countdown(timerEl, {
      getEndsAt: () => session.endsAt,
      getPausedMs: () => session.pausedLeft,
      onDone: () => {
        if (session.pub.phase !== 'acting' || session.clockTurn !== session.pub.turnNo) return;
        Kit().buzz();
        passAct(session, { type: 'timeUp' });
        routePass(shell, session);
      },
    });
    Kit().mountHoldPeek(body.querySelector('[data-peek]'), () => titleCardHtml(Core().reveal(session.hidden.current), ' '), { className: 'pk-peek-card ch-peek' });
    body.querySelector('[data-gestures]').addEventListener('click', openGestures);
    body.querySelector('[data-pause]').addEventListener('click', () => {
      if (session.pausedLeft != null) {
        session.endsAt = Date.now() + session.pausedLeft;
        session.pausedLeft = null;
      } else {
        session.pausedLeft = Math.max(0, session.endsAt - Date.now());
      }
      renderPassActing(shell, session);
    });
    body.querySelector('[data-got]').addEventListener('click', () => {
      if (!passAct(session, { type: 'got' })) return;
      Kit().ding();
      if (session.pub.phase === 'acting') renderPassActing(shell, session, 'New title! Hold 👁 to see it');
      else routePass(shell, session);
    });
    body.querySelector('[data-pass]').addEventListener('click', () => {
      if (!passAct(session, { type: 'pass' })) return;
      renderPassActing(shell, session, 'New title! Hold 👁 to see it');
    });
  }

  function renderPassTurnEnd(shell, session) {
    const nm = passNm(session);
    const st = session.pub;
    if (session.clock) session.clock.stop();
    const nextTeam = 1 - st.team;
    const list = st.teams[nextTeam];
    const nextActor = list[st.actorIdx[nextTeam] % list.length];
    const body = shell.render(`<div class="pk-page">
      ${turnSummaryHtml(st.lastTurn, session.settings, nm)}
      ${scoreStripHtml(st, session.settings, nm)}
      <div class="pk-sub">Next up: ${esc(Core().teamName(session.settings, nextTeam))} · ${esc(nm(nextActor))} acts</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>Next turn</button>
    </div>`);
    body.querySelector('[data-next]').addEventListener('click', () => {
      passAct(session, { type: 'next' });
      routePass(shell, session);
    });
  }

  function renderPassOver(shell, session) {
    const nm = passNm(session);
    const st = session.pub;
    if (session.clock) session.clock.stop();
    shell.setSubtitle('Final');
    const body = shell.render(`<div class="pk-page">
      ${turnSummaryHtml(st.lastTurn, session.settings, nm)}
      ${finalHtml(st, session.settings, nm)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>Play again</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>Teams &amp; settings</button>
      </div>
    </div>`);
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    body.querySelector('[data-share]').addEventListener('click', () => shareFinal(st, session.settings, nm));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-again]').addEventListener('click', () => {
      const game = Core().createGame(st.teams, session.settings, { lang: lang() });
      Object.assign(session, { pub: game.pub, hidden: game.hidden, clock: null, clockTurn: null });
      renderPassReady(shell, session);
    });
  }

  // ======================= ROOM =======================

  function startRoom(o) {
    Kit().createRoom({ game: GAME, label: LABEL, settings: loadSettings(), chat: o && o.chat, open: openRoom });
  }

  function lobbyTeams(ctrl, players) {
    const pick = (ctrl.view.pub && ctrl.view.pub.teamPick) || {};
    const teams = [[], []];
    players.forEach((p) => teams[pick[p.id] === 1 ? 1 : 0].push(p));
    return teams;
  }

  function openRoom(code, opts) {
    const o = opts || {};
    return Kit().openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: Core().MIN_PLAYERS,
      max: Core().MAX_PLAYERS,
      hydrate: (st) => Core().hydrateState(st),
      lobbySummary: (ctrl) => {
        const s = Core().mergeSettings(ctrl.view.pub.settings);
        if (!s.categories) s.categories = Core().packs.defaultCategories(lang());
        return metaLine(s);
      },
      openSettings: (ctrl) => {
        const s = Core().mergeSettings(ctrl.view.pub.settings);
        if (!s.categories) s.categories = Core().packs.defaultCategories(lang());
        openSettings(s, {
          onSave: (next) => {
            saveSettings(next);
            ctrl.act('settings', { settings: next });
          },
        });
      },
      lobbyListHtml: (ctrl, players) => {
        const teams = lobbyTeams(ctrl, players);
        const isHost = ctrl.isHost();
        const s = Core().mergeSettings(ctrl.view.pub.settings);
        return `<div class="pk-teams pk-teams--room">${teams
          .map(
            (t, i) => `<div class="pk-team pk-team--${i}">
              <div class="pk-team-name">${esc(Core().teamName(s, i))} · ${t.length}</div>
              ${t
                .map(
                  (p) => `<${isHost ? 'button type="button"' : 'div'} class="pk-lobby-row ch-member" ${isHost ? `data-move="${esc(p.id)}" data-to="${1 - i}" aria-label="Move ${esc(p.name)} to the other team"` : ''}>
                  <span class="pk-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${p.id === ctrl.view.pub.host ? '<span class="pk-badge">Host</span>' : ''}${p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">You</span>' : ''}${isHost ? '<span class="pk-chev" aria-hidden="true">⇄</span>' : ''}
                </${isHost ? 'button' : 'div'}>`
                )
                .join('')}
            </div>`
          )
          .join('')}</div>
          ${isHost ? '<div class="pk-hint">Tap a player to switch teams</div><button type="button" class="pk-chip pk-teams-shuffle" data-shuffle>🔀 Shuffle teams</button>' : ''}`;
      },
      onLobbyMount: (ctrl, body) => {
        body.querySelectorAll('[data-move]').forEach((btn) =>
          btn.addEventListener('click', () => ctrl.act('setTeam', { target: btn.dataset.move, team: Number(btn.dataset.to) }))
        );
        body.querySelector('[data-shuffle]')?.addEventListener('click', () => ctrl.act('shuffleTeams'));
      },
      canStart: (ctrl, players) => {
        if (players.length < Core().MIN_PLAYERS) return { ok: false, label: 'Need ' + (Core().MIN_PLAYERS - players.length) + ' more to start' };
        const teams = lobbyTeams(ctrl, players);
        if (teams.some((t) => t.length < Core().MIN_PER_TEAM)) return { ok: false, label: 'Each team needs 2+ players' };
        return { ok: true, label: 'Start' };
      },
      holdKey: (ctrl, st) => {
        const sec = ctrl.view.secret;
        return st.phase === 'ready' && st.actor === ctrl.uid && sec && Number(sec.turnNo) === Number(st.turnNo) ? 'ready:' + st.turnNo : null;
      },
      onState: onRoomState,
      renderPhase: renderRoomPhase,
    });
  }

  function onRoomState(ctrl, st, prev) {
    if (!prev || prev.turnNo !== st.turnNo) {
      if (prev && prev.phase === 'acting') feedbackForEnd(ctrl, st);
      return;
    }
    if (prev.phase === 'acting' && st.phase !== 'acting') {
      feedbackForEnd(ctrl, st);
      return;
    }
    if (st.phase === 'acting' && st.turnGot.length > prev.turnGot.length) {
      const t = st.turnGot[st.turnGot.length - 1];
      Kit().ding();
      Kit().bigReveal({ icon: '✓', title: Core().teamName(Core().mergeSettings(ctrl.view.pub.settings), st.team) + ' +1', sub: titleText(t), ms: 1200, host: ctrl.shell.el });
    }
  }

  function feedbackForEnd(ctrl, st) {
    const last = st.lastTurn;
    if (!last) return;
    if (last.reason === 'got') Kit().ding();
    else Kit().buzz();
  }

  function renderRoomPhase(ctrl, st) {
    const K = Kit();
    const me = ctrl.uid;
    const pub = ctrl.view.pub;
    const nm = ctrl.name;
    const s = Core().mergeSettings(pub.settings);
    const sec = ctrl.view.secret && Number(ctrl.view.secret.turnNo) === Number(st.turnNo) ? ctrl.view.secret : null;
    const myTeam = Core().teamOf(st, me);
    const isActor = st.actor === me;
    const onTurn = myTeam === st.team;
    ctrl.shell.setSubtitle('Room ' + ctrl.view.code + ' · Turn ' + st.turnNo);
    const timed = st.phase === 'ready' || st.phase === 'acting' || st.phase === 'turnEnd';
    const top = `${ctrl.hostBar(timed)}${ctrl.pausedNote()}${scoreStripHtml(st, s, nm)}`;
    const teamLabel = Core().teamName(s, st.team);

    if (st.phase === 'ready') {
      if (isActor) {
        const body = ctrl.render(`<div class="pk-page">${top}
          <div class="pk-progress">You’re acting for ${esc(teamLabel)}</div>
          <div data-cover></div>
          <div class="pk-timer" data-timer></div>
        </div>`);
        ctrl.wire(body);
        K.mountPassCover(body.querySelector('[data-cover]'), {
          lead: 'Your title',
          name: nm(me),
          revealHtml: () => titleCardHtml(sec && sec.title),
          doneLabel: 'Start timer ▶',
          onDone: () => ctrl.act('go'),
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page">${top}
        <div class="pk-title">${esc(nm(st.actor))} is up</div>
        <div class="pk-sub">${esc(teamLabel)}${onTurn ? ' — that’s your team. Get ready to guess!' : ' — your team watches this one.'}</div>
        <div class="pk-timer" data-timer></div>
      </div>`);
      ctrl.wire(body);
      return;
    }

    if (st.phase === 'acting') {
      const got = st.turnGot.map((t) => `<div class="ch-title-row is-got">✓ ${esc(titleText(t))}</div>`).join('');
      if (isActor) {
        const body = ctrl.render(`<div class="pk-page ch-acting">${top}
          <div class="pk-progress">You’re acting · no talking!</div>
          <div class="pk-timer ch-timer" data-timer></div>
          ${s.speed ? `<div class="ch-counter">Got ${st.turnGot.length} this turn</div>` : ''}
          <button type="button" class="ch-got" data-got>Got it ✓</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-pass ${st.passesLeft > 0 ? '' : 'disabled'}>Pass${s.passes ? ' (' + st.passesLeft + ' left)' : ''}</button></div>
          <button type="button" class="pk-peek" data-peek aria-label="Hold to see your title">👁 Hold to see your title</button>
          <button type="button" class="pk-link" data-gestures>? Gestures</button>
          <div class="ch-titles">${got}</div>
        </div>`);
        ctrl.wire(body);
        K.mountHoldPeek(body.querySelector('[data-peek]'), () => titleCardHtml(sec && sec.title, ' '), { className: 'pk-peek-card ch-peek' });
        body.querySelector('[data-gestures]').addEventListener('click', openGestures);
        body.querySelector('[data-got]').addEventListener('click', () => ctrl.act('got'));
        body.querySelector('[data-pass]').addEventListener('click', () => ctrl.act('pass'));
        return;
      }
      const body = ctrl.render(`<div class="pk-page ch-acting">${top}
        <div class="pk-progress">${esc(nm(st.actor))} is acting for ${esc(teamLabel)}</div>
        <div class="pk-timer ch-timer" data-timer></div>
        ${
          onTurn
            ? `<div class="pk-sub">Shout it out — or type your guess</div>
               <div class="im-clue-form"><input class="pk-input" data-keep="guess" data-guess maxlength="80" placeholder="Your guess" autocomplete="off" enterkeyhint="send" aria-label="Your guess">
               <button type="button" class="pk-btn pk-btn--primary" data-send>Guess</button></div>
               <div class="im-error" data-err role="status"></div>`
            : '<div class="pk-wait">Watch and enjoy — it’s the other team’s turn.</div>'
        }
        <div class="ch-titles">${got}</div>
      </div>`);
      ctrl.wire(body);
      if (onTurn) {
        const input = body.querySelector('[data-guess]');
        const err = body.querySelector('[data-err]');
        const send = async () => {
          const text = input.value.trim();
          if (!text) return input.focus();
          const out = await ctrl.act('guess', { text }, err);
          if (!out) return;
          input.value = '';
          err.textContent = out.matched ? 'You got it! +1' : 'Not quite — keep going';
        };
        body.querySelector('[data-send]').addEventListener('click', send);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && send());
      }
      return;
    }

    if (st.phase === 'turnEnd') {
      const nextTeam = 1 - st.team;
      const list = st.teams[nextTeam];
      const nextActor = list.length ? list[st.actorIdx[nextTeam] % list.length] : null;
      const body = ctrl.render(`<div class="pk-page">${ctrl.hostBar(true)}${ctrl.pausedNote()}
        ${turnSummaryHtml(st.lastTurn, s, nm)}
        ${scoreStripHtml(st, s, nm)}
        <div class="pk-sub">Next up: ${esc(Core().teamName(s, nextTeam))}${nextActor ? ' · ' + esc(nm(nextActor)) + ' acts' : ''}</div>
        <div class="pk-timer" data-timer></div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>Next turn</button>
      </div>`);
      ctrl.wire(body);
      body.querySelector('[data-next]').addEventListener('click', () => ctrl.act('nextTurn'));
      return;
    }

    if (st.phase === 'over') {
      const body = ctrl.render(`<div class="pk-page">
        ${turnSummaryHtml(st.lastTurn, s, nm)}
        ${finalHtml(st, s, nm)}
        ${K.roomResultActions(ctrl, { nextLabel: 'Play again', waitLabel: 'Waiting for the host to start a new game…' })}
      </div>`);
      K.wireRoomResultActions(ctrl, body, { nextOp: 'start', onShare: () => shareFinal(st, s, nm) });
      if (ctrl.view.celebrated !== pub.roundNo) {
        ctrl.view.celebrated = pub.roundNo;
        try {
          if (typeof gameFeedback === 'function') gameFeedback(myTeam === st.winner ? 'win' : 'select');
        } catch (e) {}
      }
    }
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
  const launch = window.PartyKit ? PartyKit.withGameData(GAME, open) : open;

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'charades',
      name: LABEL,
      desc: 'Act it out, no talking — two teams race the clock',
      icon: '🎭',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 22,
      meta: {
        kit: 'party-kit.js (Pass & Play + Room)',
        dealing: 'party_room → server-lib/party-deal.js; only the actor reads the title',
        packs: 'data/charades-packs.js',
      },
      launch,
    });
  }

  window.openCharadesGame = launch;
})();
