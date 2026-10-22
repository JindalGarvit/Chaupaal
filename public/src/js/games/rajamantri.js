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
  const LABEL = t('dangal.party.raja_mantri_chor_sipahi');
  const SETTINGS_KEY = 'chaupaal_rajamantri_settings';
  const NAMES_KEY = 'chaupaal_rajamantri_names';

  const Core = () => window.RajaMantriCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  function isHi() {
    return String(lang()).indexOf('hi') === 0;
  }

  /** The game keeps its origin role names; everyone else gets the English meaning beside them (Raja · King). */
  function roleName(roleId) {
    const r = Core().ROLES[roleId];
    if (!r) return '';
    return isHi() && r.hi ? r.hi + ' · ' + r.en : r.en + ' · ' + r.gloss;
  }

  function roleIcon(roleId) {
    return (Core().ROLES[roleId] || {}).icon || '';
  }

  function callLine(guesserRole) {
    const c = Core().CALLS[guesserRole] || Core().CALLS.mantri;
    return isHi() && c.hi ? c.hi + ' · ' + c.en : c.en + ' · ' + c.gloss;
  }

  const RAJA_QUOTE = () => (isHi() && Core().quoteHi() ? Core().quoteHi() : t('games.rajamantri.main_raja_hoon_i_m_the'));

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
    const night = Kit().passNightNames && Kit().passNightNames(4, 8);
    if (night) return night;
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
      (n > 4 ? t('games.rajamantri.extended_chits', { chits: roles.length, count: thieves }) : t('games.rajamantri.classic_chits')) +
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
      <summary>${tHtml('games.rajamantri.how_to_play_20_seconds')}</summary>
      <ol>
        <li>${tHtml('games.rajamantri.everyone_secretly_gets_a_chit')} <strong>${tHtml('games.rajamantri.raja_king_1000_mantri_minister_800')}</strong>.</li>
        <li>${tHtml('games.rajamantri.the_raja_stands_up_main_raja')}</li>
        <li>${tHtml('games.rajamantri.the_mantri_reveals_and_points_at')}</li>
        <li>${tHtml('games.rajamantri.right_everyone_keeps_their_points_wrong')} <strong>${tHtml('games.rajamantri.swap')}</strong> ${tHtml('games.rajamantri.points')}</li>
      </ol>
      <div class="pk-howto-score">${tHtml('games.rajamantri.5_8_players_add_chits_in')}</div>
      ${roleTableHtml()}
      <div class="pk-howto-score">${tHtml('games.rajamantri.with_two_thieves_the_hunter_picks')}</div>
    </details>`;
  }

  // ---------------- settings ----------------

  function openSettings(settings, opts) {
    const s = Object.assign({}, settings);
    const K = Kit();
    K.openSheet({
      title: t('games.rajamantri.game_settings'),
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.rajamantri.rounds')}</div>
          ${K.segHtml('rounds', s.rounds, Core().ROUND_OPTIONS.map((r) => [r, String(r)]))}
        </div>
        <details class="pk-advanced">
          <summary>${tHtml('games.rajamantri.advanced')}</summary>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.rajamantri.who_catches_the_chor')}</div>
            ${K.segHtml('guesser', s.guesser, /* i18n-copy */ [['mantri', t('games.rajamantri.mantri')], ['sipahi', t('games.rajamantri.sipahi')]])}
            <div class="pk-field-help">${tHtml('games.rajamantri.a_wrong_pick_swaps_points_between')}</div>
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
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
    if (!role) return '<div class="rm-chit rm-chit--empty">' + tHtml('games.rajamantri.dealing') + '</div>';
    const r = Core().ROLES[role];
    const tip =
      role === 'raja'
        ? t('games.rajamantri.you_ll_announce_yourself_first')
        : role === 'mantri' || role === 'sipahi'
          ? t('games.rajamantri.if_you_re_called_reveal_and')
          : r.thief
            ? t('games.rajamantri.stay_cool_don_t_get_caught')
            : t('games.rajamantri.sit_tight_and_keep_a_straight');
    return `<div class="rm-chit${r.thief ? ' rm-chit--thief' : ''}">
      <div class="rm-chit-icon" aria-hidden="true">${esc(r.icon)}</div>
      <div class="rm-chit-role">${esc(roleName(role))}</div>
      <div class="rm-chit-pts">${tHtml('dangal.points_count', { count: r.points })}</div>
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
    return t('games.rajamantri.find_the_rolename_value', { roleName: roleName(role), value: n > 1 ? t('games.rajamantri.pick_of_n', { pick: st.pickIndex + 1, n }) : '' });
  }

  function pickRevealOpts(pick, nm) {
    return pick.correct
      ? { icon: '🎯', title: t('games.rajamantri.caught'), sub: t('games.rajamantri.nm_was_the_rolename', { nm: nm(pick.thief), roleName: roleName(pick.role) }) }
      : { icon: '💨', title: t('games.rajamantri.wrong_pick'), sub: t('games.rajamantri.the_rolename_was_nm_points_swap', { roleName: roleName(pick.role), nm: nm(pick.thief) }) };
  }

  function resultHtml(res, nm, roundNo, rounds) {
    const base = {};
    Object.keys(res.roles).forEach((id) => (base[id] = Core().ROLES[res.roles[id]].points));
    const order = Object.keys(res.roles).sort((a, b) => Core().ROLES[res.roles[b]].points - Core().ROLES[res.roles[a]].points);
    const picks = res.picks
      .map((p) => `<div class="rm-pick ${p.correct ? 'is-right' : 'is-wrong'}">${tHtml('games.rajamantri.value_guesser_picked_target_for_role', { value: p.correct ? '🎯' : '💨', guesser: nm(res.guesser), target: nm(p.target), role: roleName(p.role), value2: { html: p.correct ? 'caught' : tHtml('games.rajamantri.wrong_it_was_thief', { thief: nm(p.thief) }) } })}</div>`)
      .join('');
    return `<div class="rm-result">
      <div class="pk-progress">${tHtml('games.rajamantri.round_roundno_of_rounds', { roundNo, rounds })}</div>
      <div class="pk-result-glyph" aria-hidden="true">${res.allCaught ? '🎯' : '🦹'}</div>
      <div class="pk-result-title">${res.allCaught ? tHtml('games.rajamantri.thief_caught') : tHtml('games.rajamantri.the_thief_got_away')}</div>
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
      <div class="pk-result-title">${tHtml('games.rajamantri.raja_of_night', { name: bidi(top ? top.name : '') })}</div>
      <div class="pk-sub">${tHtml('games.rajamantri.final_totals')}</div>
      ${Kit().scoreboardHtml(players, scores)}
    </div>`;
  }

  function shareFinal(players, scores) {
    const top = players.slice().sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))[0];
    Kit().shareLine(GAME, LABEL, t('games.rajamantri.value_is_the_raja_of_the', { value: top ? top.name : t('common.someone'), value2: scores[top && top.id] || 0 }));
  }

  function shareRound(res, nm) {
    const line = res.allCaught
      ? t('games.rajamantri.nm_caught_the_chor', { nm: nm(res.guesser) })
      : t('games.rajamantri.value_fooled_the_rolename', { value: res.picks.filter((p) => !p.correct).map((p) => nm(p.thief)).join(' & '), roleName: roleName(res.guesserRole) });
    Kit().shareLine(GAME, LABEL, line);
  }

  // ---------------- entry ----------------

  function open(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast(t('games.rajamantri.label_is_still_loading_try_again', { LABEL }));
      return;
    }
    if ((c.source === 'chat_group' || c.isGroup) && c.chat) {
      startRoom({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('games.rajamantri.party'), confirmLeave: () => false });
    if (c.mode === 'pass') renderPassSetup(shell);
    else renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '👑',
        title: t('games.rajamantri.who_s_the_chor'),
        sub: t('games.rajamantri.4_8_players_secret_chits_one'),
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
        <div class="pk-title">${tHtml('games.rajamantri.who_s_playing')}</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="${tHtml('games.rajamantri.game_settings')}">⚙︎</button>
      </div>
      <div data-editor></div>
      <div class="pk-meta" data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${tHtml('games.rajamantri.start')}</button>
    </div>`);
    shell.setBack(() => renderHome(shell));
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
    return p ? p.name : t('common.someone');
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
    shell.setSubtitle(t('games.rajamantri.round_roundno_of_rounds', { roundNo: session.roundNo, rounds: session.settings.rounds }));
    shell.guard = true;
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
      <div class="pk-progress">${tHtml('games.rajamantri.chit_value_of_ordercount', { value: index + 1, orderCount: order.length })}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      name: nameOf(session, id),
      revealHtml: () => chitHtml(secret.role),
      doneLabel: index === order.length - 1 ? t('games.rajamantri.hide_start') : t('games.rajamantri.hide_pass'),
      onDone: () => renderPassDeal(shell, session, index + 1),
    });
  }

  function renderPassRaja(shell, session) {
    const nm = (id) => nameOf(session, id);
    const st = session.round.pub;
    const body = shell.render(`<div class="pk-page rm-stage">
      <div class="pk-title">${tHtml('games.rajamantri.put_the_phone_in_the_middle')}</div>
      <div class="pk-sub">${tHtml('games.rajamantri.everyone_has_seen_their_chit_time')}</div>
      ${tableHtml(st, nm)}
      <button type="button" class="rm-big-btn" data-go>${tHtml('games.rajamantri.reveal_the_raja')}</button>
    </div>`);
    body.querySelector('[data-go]').addEventListener('click', async () => {
      passAct(session, { type: 'revealRaja' });
      await Kit().bigReveal({ icon: '👑', title: t('games.rajamantri.nm_is_the_raja', { nm: nm(session.round.pub.raja) }), quote: RAJA_QUOTE(), host: shell.el });
      renderPassCall(shell, session);
    });
  }

  function renderPassCall(shell, session) {
    const nm = (id) => nameOf(session, id);
    const st = session.round.pub;
    const role = st.guesserRole;
    const body = shell.render(`<div class="pk-page rm-stage">
      <div class="pk-progress">${tHtml('games.rajamantri.the_raja_calls')}</div>
      <div class="rm-quote">“${esc(callLine(role))}”</div>
      ${tableHtml(st, nm)}
      <button type="button" class="rm-big-btn" data-go>${tHtml('games.rajamantri.role_reveal_the_en', { role: roleIcon(role), en: Core().ROLES[role].en })}</button>
    </div>`);
    body.querySelector('[data-go]').addEventListener('click', async () => {
      passAct(session, { type: 'revealGuesser' });
      await Kit().bigReveal({ icon: roleIcon(role), title: t('games.rajamantri.nm_is_the_rolename', { nm: nm(session.round.pub.guesser), roleName: roleName(role) }), host: shell.el });
      renderPassGuess(shell, session);
    });
  }

  function renderPassGuess(shell, session) {
    const nm = (id) => nameOf(session, id);
    const st = session.round.pub;
    const body = shell.render(`<div class="pk-page rm-stage">
      <div class="pk-progress">${esc(huntLine(st))}</div>
      <div class="pk-title">${tHtml('games.rajamantri.name_who_is_it', { name: bidi(nm(st.guesser)) })}</div>
      <div class="pk-sub">${tHtml('games.rajamantri.point_at_them_then_tap_their')}</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pick disabled>${tHtml('games.rajamantri.pick_someone')}</button>
      ${tableHtml(st, nm)}
    </div>`);
    let target = null;
    const btn = body.querySelector('[data-pick]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: Core().candidates(st).map((id) => ({ id, name: nm(id) })),
      onPick: (ids) => {
        target = ids[0];
        btn.disabled = !target;
        btn.textContent = t('games.rajamantri.it_s_nm', { nm: nm(target) });
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
      <div class="pk-section">${tHtml('games.rajamantri.totals')}</div>
      ${Kit().scoreboardHtml(session.players, session.scores, res.points)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${last ? tHtml('games.rajamantri.see_the_final_board') : tHtml('games.rajamantri.next_round')}</button>
      <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button></div>
    </div>`);
    body.querySelector('[data-share]').addEventListener('click', () => shareRound(res, nm));
    body.querySelector('[data-next]').addEventListener('click', () => (last ? renderPassFinal(shell, session) : startPassRound(shell, session)));
  }

  function renderPassFinal(shell, session) {
    shell.guard = false;
    shell.setSubtitle(t('games.rajamantri.final'));
    Kit().reportPass(GAME, { players: session.players, scores: session.scores });
    const body = shell.render(`<div class="pk-page">
      ${finalHtml(session.players, session.scores)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${tHtml('games.rajamantri.play_again')}</button>
      ${Kit().passHubButtonHtml()}
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>${tHtml('games.rajamantri.players_settings')}</button>
      </div>
    </div>`);
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    Kit().wirePassHub(body, shell);
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
    if (!prev.raja && st.raja) Kit().bigReveal({ icon: '👑', title: t('games.rajamantri.nm_is_the_raja', { nm: nm(st.raja) }), quote: RAJA_QUOTE(), host });
    else if (!prev.guesser && st.guesser) Kit().bigReveal({ icon: roleIcon(st.guesserRole), title: t('games.rajamantri.nm_is_the_rolename', { nm: nm(st.guesser), roleName: roleName(st.guesserRole) }), host });
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
    ctrl.shell.setSubtitle(t('games.rajamantri.room_code_round_roundno_of_rounds', { code: ctrl.view.code, roundNo: pub.roundNo, rounds: settings.rounds }));
    const peek = inRound ? '<button type="button" class="pk-peek" data-peek aria-label="' + tHtml('games.rajamantri.hold_to_peek_at_your_chit_2') + '">' + tHtml('games.rajamantri.hold_to_peek_at_your_chit') + '</button>' : '';
    const wirePeek = (body) => K.mountHoldPeek(body.querySelector('[data-peek]'), () => chitHtml(myRole));
    const timed = st.phase !== 'result';
    const top = `${ctrl.hostBar(timed)}${ctrl.pausedNote()}`;

    if (st.phase === 'reveal') {
      const ready = st.players.filter((id) => pub.seen && pub.seen[id]).length;
      if (inRound && !(pub.seen && pub.seen[me])) {
        const body = ctrl.render(`<div class="pk-page">
          <div class="pk-progress">${tHtml('games.rajamantri.round_roundno_ready_playerscount_ready', { roundNo: pub.roundNo, ready, playersCount: st.players.length })}</div>
          <div data-cover></div>
        </div>`);
        K.mountPassCover(body.querySelector('[data-cover]'), {
          lead: t('games.rajamantri.your_chit'),
          name: nm(me),
          revealHtml: () => chitHtml(myRole),
          doneLabel: t('games.rajamantri.i_ve_seen_it'),
          onDone: () => ctrl.act('seen'),
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page">${top}
        <div class="pk-title">${tHtml('games.rajamantri.waiting_for_everyone_to_see_their')}</div>
        <div class="pk-sub">${tHtml('dangal.ready_of', { n: ready, total: st.players.length })}</div>
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
        <div class="pk-title">${mine ? tHtml('games.rajamantri.you_re_the_raja') : tHtml('games.rajamantri.who_s_the_raja')}</div>
        <div class="pk-timer" data-timer></div>
        ${mine ? '<button type="button" class="rm-big-btn" data-go>' + tHtml('games.rajamantri.i_m_the_raja') + '</button>' : '<div class="pk-wait">' + tHtml('games.rajamantri.waiting_for_the_raja_to_stand') + '</div>'}
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
        <div class="pk-progress">${tHtml('games.rajamantri.raja_calls', { name: bidi(nm(st.raja)) })}</div>
        <div class="rm-quote">“${esc(callLine(role))}”</div>
        <div class="pk-timer" data-timer></div>
        ${mine ? `<button type="button" class="rm-big-btn" data-go>${tHtml('games.rajamantri.role_i_m_the_en', { role: roleIcon(role), en: Core().ROLES[role].en })}</button>` : `<div class="pk-wait">${tHtml('games.rajamantri.waiting_for_the_role', { role: roleName(role) })}</div>`}
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
        <div class="pk-title">${mine ? tHtml('games.rajamantri.who_is_it') : tHtml('games.rajamantri.guesser_is_deciding', { guesser: nm(st.guesser) })}</div>
        <div class="pk-timer" data-timer></div>
        ${mine ? '<div data-picker></div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pick disabled>' + tHtml('games.rajamantri.pick_someone') + '</button>' : ''}
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
            btn.textContent = t('games.rajamantri.it_s_nm', { nm: nm(target) });
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
        ${over ? finalHtml(players, pub.scores) : `<div class="pk-section">${tHtml('games.rajamantri.totals')}</div>${K.scoreboardHtml(players, pub.scores, st.result.points)}`}
        ${K.roomResultActions(ctrl, {
          nextLabel: over ? t('games.rajamantri.play_again') : t('games.rajamantri.next_round'),
          waitLabel: over ? t('games.rajamantri.waiting_for_the_host_to_start') : t('games.rajamantri.waiting_for_the_host_to_deal'),
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
      desc: t('games.rajamantri.secret_chits_the_mantri_has_to'),
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
        kit: t('games.rajamantri.party_kit_js_pass_play_room'),
        dealing: 'party_room → server-lib/party-deal.js; chits readable only by their owner until revealed',
      },
      launch,
    });
  }

  window.openRajaMantriGame = launch;
})();
