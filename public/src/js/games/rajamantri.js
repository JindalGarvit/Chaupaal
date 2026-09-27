/**
 * Raja Mantri Chor Sipahi — Dangal party game (G2) on the Party Kit.
 *   Pass & Play: one phone, offline, no sign-in — RajaMantriCore runs locally.
 *   Room: each player on their own phone — chits dealt by party_room (server-lib/party-deal.js);
 *         a chit is readable only by its owner until it is revealed out loud.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'rajamantri';
  const LABEL = 'Raja Mantri Chor Sipahi';
  const SETTINGS_KEY = 'chaupaal_rajamantri_settings';
  const NAMES_KEY = 'chaupaal_rajamantri_names';

  const Core = () => window.RajaMantriCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  /** Role names are always bilingual (reader's language first). */
  function roleName(roleId) {
    return Core().roleLabel(roleId, lang(), true);
  }

  function roleIcon(roleId) {
    return (Core().ROLES[roleId] || {}).icon || '';
  }

  function callLine(guesserRole) {
    const c = Core().CALLS[guesserRole] || Core().CALLS.mantri;
    return String(lang()).indexOf('hi') === 0 ? c.hi + ' · ' + c.en : c.en + ' · ' + c.hi;
  }

  function loadSettings() {
    try {
      return Core().mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Core().mergeSettings({});
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadNames() {
    try {
      const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');
      if (Array.isArray(raw) && raw.length >= 4) return raw.slice(0, 8);
    } catch (e) {}
    return [Kit().myName() || '', '', '', ''];
  }

  function saveNames(names) {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 8)));
    } catch (e) {}
  }

  function modeLine(n, s) {
    const roles = Core().rolesFor(Math.min(8, Math.max(4, n)));
    const thieves = roles.filter((r) => Core().ROLES[r].thief).length;
    return (
      (n > 4 ? 'Extended · ' + roles.length + ' chits · ' + thieves + ' thieves' : 'Classic · 4 chits') +
      ' · ' + s.rounds + ' rounds' +
      (s.guesser === 'sipahi' ? ' · Sipahi hunts' : '')
    );
  }

  // ---------------- how-to ----------------

  function roleTableHtml() {
    const R = Core().ROLES;
    const order = Core().CLASSIC.concat(Core().EXTENDED_ORDER);
    return `<div class="rm-roles">${order
      .map((id, i) => {
        const r = R[id];
        const from = i < 4 ? '4+' : String(i + 1) + '+';
        return `<div class="rm-roles-row"><span aria-hidden="true">${esc(r.icon)}</span><span class="rm-roles-name">${esc(roleName(id))}</span><span class="rm-roles-pts">${r.points}</span><span class="rm-roles-from">${from}</span></div>`;
      })
      .join('')}</div>`;
  }

  function howToCardHtml() {
    return `<details class="pk-howto">
      <summary>How to play · 20 seconds</summary>
      <ol>
        <li>Everyone secretly gets a chit: <strong>Raja 1000 · Mantri 800 · Sipahi 500 · Chor 0</strong>.</li>
        <li>The Raja announces “Main Raja hoon!” and calls the Mantri to find the Chor.</li>
        <li>The Mantri reveals and points at who they think is the Chor.</li>
        <li>Right — everyone keeps their points. Wrong — Mantri and Chor <strong>swap</strong> points.</li>
      </ol>
      <div class="pk-howto-score">5–8 players add chits in this order (points · from players):</div>
      ${roleTableHtml()}
      <div class="pk-howto-score">With two thieves the hunter picks once per thief; each wrong pick hands that thief an equal share of the hunter’s points.</div>
    </details>`;
  }

  // ---------------- settings ----------------

  function openSettings(settings, opts) {
    const s = Object.assign({}, settings);
    const K = Kit();
    K.openSheet({
      title: 'Game settings',
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">Rounds</div>
          ${K.segHtml('rounds', s.rounds, Core().ROUND_OPTIONS.map((r) => [r, String(r)]))}
        </div>
        <details class="pk-advanced">
          <summary>Advanced</summary>
          <div class="pk-field">
            <div class="pk-field-label">Who catches the Chor</div>
            ${K.segHtml('guesser', s.guesser, [['mantri', 'Mantri'], ['sipahi', 'Sipahi']])}
            <div class="pk-field-help">A wrong pick swaps points between the hunter and the thief.</div>
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>Done</button>`,
      onMount(sheet, close) {
        K.wireSegs(sheet, s);
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          close();
          opts.onSave(Core().mergeSettings(s));
        });
      },
    });
  }

  // ---------------- shared views ----------------

  function chitHtml(role) {
    if (!role) return '<div class="rm-chit rm-chit--empty">Dealing…</div>';
    const r = Core().ROLES[role];
    const tip =
      role === 'raja'
        ? 'You’ll announce yourself first.'
        : role === 'mantri' || role === 'sipahi'
          ? 'If you’re called, reveal and hunt the thief.'
          : r.thief
            ? 'Stay cool — don’t get caught.'
            : 'Sit tight and keep a straight face.';
    return `<div class="rm-chit${r.thief ? ' rm-chit--thief' : ''}">
      <div class="rm-chit-icon" aria-hidden="true">${esc(r.icon)}</div>
      <div class="rm-chit-role">${esc(roleName(role))}</div>
      <div class="rm-chit-pts">${r.points} points</div>
      <div class="rm-chit-tip">${esc(tip)}</div>
    </div>`;
  }

  /** Who has revealed so far. Unrevealed players show a folded chit. */
  function tableHtml(st, nm) {
    return `<div class="rm-table">${st.players
      .map((id) => {
        const role = st.revealed[id];
        return `<div class="rm-seat${role ? ' is-open' : ''}${role && Core().ROLES[role].thief ? ' is-thief' : ''}">
          <span class="rm-seat-icon" aria-hidden="true">${role ? esc(roleIcon(role)) : '📜'}</span>
          <span class="rm-seat-name">${esc(nm(id))}</span>
          <span class="rm-seat-role">${role ? esc(roleName(role)) : '?'}</span>
        </div>`;
      })
      .join('')}</div>`;
  }

  function huntLine(st) {
    const role = Core().currentThiefRole(st);
    if (!role) return '';
    const n = st.thiefOrder.length;
    return 'Find the ' + roleName(role) + (n > 1 ? ' (' + (st.pickIndex + 1) + ' of ' + n + ')' : '');
  }

  function pickRevealOpts(pick, nm) {
    return pick.correct
      ? { icon: '🎯', title: 'Caught!', sub: nm(pick.thief) + ' was the ' + roleName(pick.role) }
      : { icon: '💨', title: 'Wrong pick!', sub: 'The ' + roleName(pick.role) + ' was ' + nm(pick.thief) + ' — points swap' };
  }

  function resultHtml(res, nm, roundNo, rounds) {
    const base = {};
    Object.keys(res.roles).forEach((id) => (base[id] = Core().ROLES[res.roles[id]].points));
    const order = Object.keys(res.roles).sort((a, b) => Core().ROLES[res.roles[b]].points - Core().ROLES[res.roles[a]].points);
    const picks = res.picks
      .map((p) => `<div class="rm-pick ${p.correct ? 'is-right' : 'is-wrong'}">${p.correct ? '🎯' : '💨'} ${esc(nm(res.guesser))} picked ${esc(nm(p.target))} for ${esc(roleName(p.role))} — ${p.correct ? 'caught' : 'wrong, it was ' + esc(nm(p.thief))}</div>`)
      .join('');
    return `<div class="rm-result">
      <div class="pk-progress">Round ${roundNo} of ${rounds}</div>
      <div class="pk-result-glyph" aria-hidden="true">${res.allCaught ? '🎯' : '🦹'}</div>
      <div class="pk-result-title">${res.allCaught ? 'Thief caught!' : 'The thief got away!'}</div>
      ${picks}
      <div class="rm-chits">${order
        .map((id) => {
          const role = res.roles[id];
          const diff = res.points[id] - base[id];
          return `<div class="rm-chit-row${Core().ROLES[role].thief ? ' is-thief' : ''}">
            <span aria-hidden="true">${esc(roleIcon(role))}</span>
            <span class="rm-chit-row-name">${esc(nm(id))}</span>
            <span class="rm-chit-row-role">${esc(roleName(role))}</span>
            <span class="rm-chit-row-pts">${res.points[id]}${diff ? `<em>${diff > 0 ? '+' : ''}${diff}</em>` : ''}</span>
          </div>`;
        })
        .join('')}</div>
    </div>`;
  }

  function finalHtml(players, scores) {
    const top = players.slice().sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))[0];
    return `<div class="rm-final">
      <div class="pk-result-glyph" aria-hidden="true">👑</div>
      <div class="pk-result-title">${esc(top ? top.name : '')} is the Raja of the night!</div>
      <div class="pk-sub">Final totals</div>
      ${Kit().scoreboardHtml(players, scores)}
    </div>`;
  }

  function shareFinal(players, scores) {
    const top = players.slice().sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))[0];
    Kit().shareLine(GAME, LABEL, (top ? top.name : 'Someone') + ' is the Raja of the night 👑 (' + (scores[top && top.id] || 0) + ' pts)');
  }

  function shareRound(res, nm) {
    const line = res.allCaught
      ? nm(res.guesser) + ' caught the Chor 🎯'
      : res.picks.filter((p) => !p.correct).map((p) => nm(p.thief)).join(' & ') + ' fooled the ' + roleName(res.guesserRole) + ' 🦹';
    Kit().shareLine(GAME, LABEL, line);
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
        icon: '👑',
        title: 'Who’s the Chor?',
        sub: '4–8 players · secret chits, one big accusation',
        howToHtml: howToCardHtml(),
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
        <div class="pk-title">Who’s playing?</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="Game settings">⚙︎</button>
      </div>
      <div data-editor></div>
      <div class="pk-meta" data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>Start</button>
    </div>`);
    const editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), {
      names: loadNames(),
      min: Core().MIN_PLAYERS,
      max: Core().MAX_PLAYERS,
      onChange: () => paintMeta(),
    });
    const paintMeta = () => {
      const meta = body.querySelector('[data-meta]');
      if (meta) meta.textContent = modeLine(editor.count(), settings);
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
      saveNames(names);
      const session = {
        players: names.map((name, i) => ({ id: 'p' + i, name })),
        scores: {},
        roundNo: 0,
        settings: Core().mergeSettings(settings),
      };
      session.players.forEach((p) => (session.scores[p.id] = 0));
      startPassRound(shell, session);
    });
  }

  function nameOf(session, id) {
    const p = session.players.find((x) => x.id === id);
    return p ? p.name : 'Someone';
  }

  function startPassRound(shell, session) {
    const ids = session.players.map((p) => p.id);
    const dealt = Core().deal(ids, session.settings);
    session.roundNo += 1;
    session.round = {
      hidden: dealt.hidden,
      secrets: dealt.secrets,
      pub: Core().createRound(ids, dealt.settings),
    };
    shell.setSubtitle('Round ' + session.roundNo + ' of ' + session.settings.rounds);
    renderPassDeal(shell, session, 0);
  }

  function passAct(session, action) {
    const r = session.round;
    const out = Core().applyAction(r.pub, r.hidden, session.settings, action);
    if (out.error) return null;
    r.pub = out.pub;
    return out;
  }

  /** Forward-only chit handout. */
  function renderPassDeal(shell, session, index) {
    const order = session.round.pub.players;
    if (index >= order.length) {
      session.round.secrets = null;
      passAct(session, { type: 'startRaja' });
      renderPassRaja(shell, session);
      return;
    }
    const id = order[index];
    const secret = session.round.secrets[id];
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">Chit ${index + 1} of ${order.length}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      name: nameOf(session, id),
      revealHtml: () => chitHtml(secret.role),
      doneLabel: index === order.length - 1 ? 'Hide & start' : 'Hide & pass',
      onDone: () => renderPassDeal(shell, session, index + 1),
    });
  }

  function renderPassRaja(shell, session) {
    const nm = (id) => nameOf(session, id);
    const st = session.round.pub;
    const body = shell.render(`<div class="pk-page rm-stage">
      <div class="pk-title">Put the phone in the middle</div>
      <div class="pk-sub">Everyone has seen their chit. Time for the Raja!</div>
      ${tableHtml(st, nm)}
      <button type="button" class="rm-big-btn" data-go>👑 Reveal the Raja</button>
    </div>`);
    body.querySelector('[data-go]').addEventListener('click', async () => {
      passAct(session, { type: 'revealRaja' });
      await Kit().bigReveal({ icon: '👑', title: nm(session.round.pub.raja) + ' is the Raja!', quote: 'Main Raja hoon!', host: shell.el });
      renderPassCall(shell, session);
    });
  }

  function renderPassCall(shell, session) {
    const nm = (id) => nameOf(session, id);
    const st = session.round.pub;
    const role = st.guesserRole;
    const body = shell.render(`<div class="pk-page rm-stage">
      <div class="pk-progress">The Raja calls</div>
      <div class="rm-quote">“${esc(callLine(role))}”</div>
      ${tableHtml(st, nm)}
      <button type="button" class="rm-big-btn" data-go>${esc(roleIcon(role))} Reveal the ${esc(Core().ROLES[role].en)}</button>
    </div>`);
    body.querySelector('[data-go]').addEventListener('click', async () => {
      passAct(session, { type: 'revealGuesser' });
      await Kit().bigReveal({ icon: roleIcon(role), title: nm(session.round.pub.guesser) + ' is the ' + roleName(role) + '!', host: shell.el });
      renderPassGuess(shell, session);
    });
  }

  function renderPassGuess(shell, session) {
    const nm = (id) => nameOf(session, id);
    const st = session.round.pub;
    const body = shell.render(`<div class="pk-page rm-stage">
      <div class="pk-progress">${esc(huntLine(st))}</div>
      <div class="pk-title">${esc(nm(st.guesser))}, who is it?</div>
      <div class="pk-sub">Point at them — then tap their name.</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pick disabled>Pick someone</button>
      ${tableHtml(st, nm)}
    </div>`);
    let target = null;
    const btn = body.querySelector('[data-pick]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: Core().candidates(st).map((id) => ({ id, name: nm(id) })),
      onPick: (ids) => {
        target = ids[0];
        btn.disabled = !target;
        btn.textContent = 'It’s ' + nm(target) + '!';
      },
    });
    btn.addEventListener('click', async () => {
      if (!target) return;
      const out = passAct(session, { type: 'pick', target });
      if (!out) return;
      const pick = session.round.pub.picks[session.round.pub.picks.length - 1];
      if (pick.correct) Kit().ding();
      else Kit().buzz();
      await Kit().bigReveal(Object.assign({ host: shell.el }, pickRevealOpts(pick, nm)));
      if (session.round.pub.phase === 'result') renderPassResult(shell, session);
      else renderPassGuess(shell, session);
    });
  }

  function renderPassResult(shell, session) {
    const nm = (id) => nameOf(session, id);
    const res = session.round.pub.result;
    if (!session.round.scored) {
      session.round.scored = true;
      Object.keys(res.points).forEach((id) => (session.scores[id] = (session.scores[id] || 0) + res.points[id]));
    }
    const last = session.roundNo >= session.settings.rounds;
    const body = shell.render(`<div class="pk-page">
      ${resultHtml(res, nm, session.roundNo, session.settings.rounds)}
      <div class="pk-section">Totals</div>
      ${Kit().scoreboardHtml(session.players, session.scores, res.points)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${last ? 'See the final board' : 'Next round'}</button>
      <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button></div>
    </div>`);
    body.querySelector('[data-share]').addEventListener('click', () => shareRound(res, nm));
    body.querySelector('[data-next]').addEventListener('click', () => (last ? renderPassFinal(shell, session) : startPassRound(shell, session)));
  }

  function renderPassFinal(shell, session) {
    shell.setSubtitle('Final');
    const body = shell.render(`<div class="pk-page">
      ${finalHtml(session.players, session.scores)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>Play again</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>Share</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>Players &amp; settings</button>
      </div>
    </div>`);
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    body.querySelector('[data-share]').addEventListener('click', () => shareFinal(session.players, session.scores));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-again]').addEventListener('click', () => {
      session.players.forEach((p) => (session.scores[p.id] = 0));
      session.roundNo = 0;
      startPassRound(shell, session);
    });
  }

  // ======================= ROOM =======================

  function startRoom(o) {
    Kit().createRoom({ game: GAME, label: LABEL, settings: loadSettings(), chat: o && o.chat, open: openRoom });
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
      lobbySummary: (ctrl) => modeLine(Math.max(4, ctrl.players().length), Core().mergeSettings(ctrl.view.pub.settings)),
      openSettings: (ctrl) =>
        openSettings(Core().mergeSettings(ctrl.view.pub.settings), {
          onSave: (next) => {
            saveSettings(next);
            ctrl.act('settings', { settings: next });
          },
        }),
      onState: onRoomState,
      holdKey: (ctrl, st) => {
        const pub = ctrl.view.pub;
        const mineOk = ctrl.view.secret && Number(ctrl.view.secret.roundNo) === Number(pub.roundNo);
        return st.phase === 'reveal' && mineOk && st.players.indexOf(ctrl.uid) >= 0 && !(pub.seen && pub.seen[ctrl.uid])
          ? 'reveal:' + pub.roundNo
          : null;
      },
      renderPhase: renderRoomPhase,
    });
  }

  /** The big reveal moments play on every phone as the shared state moves. */
  function onRoomState(ctrl, st, prev) {
    if (!prev || prev.players.join() !== st.players.join()) return;
    const nm = ctrl.name;
    const host = ctrl.shell.el;
    if (!prev.raja && st.raja) Kit().bigReveal({ icon: '👑', title: nm(st.raja) + ' is the Raja!', quote: 'Main Raja hoon!', host });
    else if (!prev.guesser && st.guesser) Kit().bigReveal({ icon: roleIcon(st.guesserRole), title: nm(st.guesser) + ' is the ' + roleName(st.guesserRole) + '!', host });
    else if (st.picks.length > prev.picks.length) {
      const pick = st.picks[st.picks.length - 1];
      if (pick.correct) Kit().ding();
      else Kit().buzz();
      Kit().bigReveal(Object.assign({ host }, pickRevealOpts(pick, nm)));
    }
  }

  function renderRoomPhase(ctrl, st) {
    const K = Kit();
    const me = ctrl.uid;
    const pub = ctrl.view.pub;
    const nm = ctrl.name;
    const settings = Core().mergeSettings(pub.settings);
    const secret = ctrl.view.secret && Number(ctrl.view.secret.roundNo) === Number(pub.roundNo) ? ctrl.view.secret : null;
    const myRole = secret ? secret.role : null;
    const inRound = st.players.indexOf(me) >= 0;
    ctrl.shell.setSubtitle('Room ' + ctrl.view.code + ' · Round ' + pub.roundNo + ' of ' + settings.rounds);
    const peek = inRound ? '<button type="button" class="pk-peek" data-peek aria-label="Hold to peek at your chit">👁 Hold to peek at your chit</button>' : '';
    const wirePeek = (body) => K.mountHoldPeek(body.querySelector('[data-peek]'), () => chitHtml(myRole));
    const timed = st.phase !== 'result';
    const top = `${ctrl.hostBar(timed)}${ctrl.pausedNote()}`;

    if (st.phase === 'reveal') {
      const ready = st.players.filter((id) => pub.seen && pub.seen[id]).length;
      if (inRound && !(pub.seen && pub.seen[me])) {
        const body = ctrl.render(`<div class="pk-page">
          <div class="pk-progress">Round ${pub.roundNo} · ${ready}/${st.players.length} ready</div>
          <div data-cover></div>
        </div>`);
        K.mountPassCover(body.querySelector('[data-cover]'), {
          lead: 'Your chit',
          name: nm(me),
          revealHtml: () => chitHtml(myRole),
          doneLabel: 'I’ve seen it',
          onDone: () => ctrl.act('seen'),
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page">${top}
        <div class="pk-title">Waiting for everyone to see their chit</div>
        <div class="pk-sub">${ready}/${st.players.length} ready</div>
        <div class="pk-timer" data-timer></div>
        ${peek}
      </div>`);
      ctrl.wire(body);
      wirePeek(body);
      return;
    }

    if (st.phase === 'raja') {
      const mine = myRole === 'raja';
      const body = ctrl.render(`<div class="pk-page rm-stage">${top}
        <div class="pk-title">${mine ? 'You’re the Raja!' : 'Who’s the Raja?'}</div>
        <div class="pk-timer" data-timer></div>
        ${mine ? '<button type="button" class="rm-big-btn" data-go>👑 Main Raja hoon!</button>' : '<div class="pk-wait">Waiting for the Raja to stand up…</div>'}
        ${tableHtml(st, nm)}
        ${peek}
      </div>`);
      ctrl.wire(body);
      wirePeek(body);
      body.querySelector('[data-go]')?.addEventListener('click', () => ctrl.act('revealRaja'));
      return;
    }

    if (st.phase === 'call') {
      const role = st.guesserRole;
      const mine = myRole === role;
      const body = ctrl.render(`<div class="pk-page rm-stage">${top}
        <div class="pk-progress">${esc(nm(st.raja))} (Raja) calls</div>
        <div class="rm-quote">“${esc(callLine(role))}”</div>
        <div class="pk-timer" data-timer></div>
        ${mine ? `<button type="button" class="rm-big-btn" data-go>${esc(roleIcon(role))} I’m the ${esc(Core().ROLES[role].en)}</button>` : `<div class="pk-wait">Waiting for the ${esc(roleName(role))}…</div>`}
        ${tableHtml(st, nm)}
        ${peek}
      </div>`);
      ctrl.wire(body);
      wirePeek(body);
      body.querySelector('[data-go]')?.addEventListener('click', () => ctrl.act('revealGuesser'));
      return;
    }

    if (st.phase === 'guess') {
      const mine = st.guesser === me;
      const body = ctrl.render(`<div class="pk-page rm-stage">${top}
        <div class="pk-progress">${esc(huntLine(st))}</div>
        <div class="pk-title">${mine ? 'Who is it?' : esc(nm(st.guesser)) + ' is deciding…'}</div>
        <div class="pk-timer" data-timer></div>
        ${mine ? '<div data-picker></div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pick disabled>Pick someone</button>' : ''}
        ${tableHtml(st, nm)}
        ${peek}
      </div>`);
      ctrl.wire(body);
      wirePeek(body);
      if (mine) {
        let target = null;
        const btn = body.querySelector('[data-pick]');
        K.mountPicker(body.querySelector('[data-picker]'), {
          players: Core().candidates(st).map((id) => ({ id, name: nm(id) })),
          onPick: (ids) => {
            target = ids[0];
            btn.disabled = !target;
            btn.textContent = 'It’s ' + nm(target) + '!';
          },
        });
        btn.addEventListener('click', () => target && ctrl.act('pick', { target }));
      }
      return;
    }

    if (st.phase === 'result' && st.result) {
      const players = ctrl.players().map((p) => ({ id: p.id, name: p.name }));
      const over = !!pub.over;
      const body = ctrl.render(`<div class="pk-page">
        ${resultHtml(st.result, nm, pub.roundNo, settings.rounds)}
        ${over ? finalHtml(players, pub.scores) : `<div class="pk-section">Totals</div>${K.scoreboardHtml(players, pub.scores, st.result.points)}`}
        ${K.roomResultActions(ctrl, {
          nextLabel: over ? 'Play again' : 'Next round',
          waitLabel: over ? 'Waiting for the host to start a new game…' : 'Waiting for the host to deal the next round…',
        })}
      </div>`);
      K.wireRoomResultActions(ctrl, body, {
        nextOp: over ? 'start' : 'next',
        onShare: () => (over ? shareFinal(players, pub.scores) : shareRound(st.result, nm)),
      });
      if (ctrl.view.celebrated !== pub.roundNo) {
        ctrl.view.celebrated = pub.roundNo;
        try {
          if (typeof gameFeedback === 'function') gameFeedback(over ? 'win' : 'select');
        } catch (e) {}
      }
    }
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
  const launch = window.PartyKit ? PartyKit.withGameData(GAME, open) : open;

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'rajamantri',
      name: LABEL,
      desc: 'Secret chits — the Mantri has to catch the Chor',
      icon: '👑',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 21,
      meta: {
        kit: 'party-kit.js (Pass & Play + Room)',
        dealing: 'party_room → server-lib/party-deal.js; chits readable only by their owner until revealed',
      },
      launch,
    });
  }

  window.openRajaMantriGame = launch;
})();
