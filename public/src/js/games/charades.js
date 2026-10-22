/**
 * Charades — Dangal party game (G2) on the Party Kit. Two teams; the actor mimes a title, no talking.
 *   Pass & Play: one phone, offline, no sign-in — CharadesCore runs locally; the actor peeks at the
 *                title, then holds a big countdown with Got it / Pass that never shows the answer.
 *   Room ("Together or on a video call"): only the actor's secrets node holds the title
 *                (server-lib/party-deal.js); teammates may type guesses that auto-credit the team.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'charades';
  const LABEL = t('dangal.identity.charades.label');
  const SETTINGS_KEY = 'chaupaal_charades_settings';
  const TEAMS_KEY = 'chaupaal_charades_teams';

  const Core = () => window.CharadesCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  const KIND = {
    movie: t('games.charades.kind_movie'),
    song: t('games.charades.kind_song'),
    tv: t('games.charades.tv_show_2'),
    person: t('games.charades.famous_person'),
    phrase: t('games.charades.kind_saying'),
    action: t('games.charades.kind_action'),
  };

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  function isHi() {
    return String(lang()).indexOf('hi') === 0;
  }

  /** Titles show in the room content language (my UI language in Pass & Play), English beside them. */
  function contentLang() {
    return Kit() && Kit().roomContentLang ? Kit().roomContentLang() : lang();
  }
  function primaryOf(t) {
    const l = String(contentLang()).split('-')[0];
    return (l !== 'en' && t[l]) || t.en;
  }
  const DIFF = { easy: t('games.charades.easy'), medium: t('games.charades.medium'), hard: t('games.charades.hard') };

  function packLabel(p) {
    return p ? (isHi() && p.hi ? p.hi + ' · ' + p.en : p.en) : '';
  }

  /** Global core by default; India add-ons follow the locale until the host picks categories. */
  function loadSettings() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch (e) {}
    if (!raw.region) raw.region = Kit().contentPrefs().region;
    const s = Core().mergeSettings(raw);
    if (!s.categories) s.categories = Core().packs.defaultCategories(lang(), s.region);
    return s;
  }

  /** Host's own titles for tonight (AI draft or saved on this phone). */
  let customTitles = null;
  function startArgs() {
    return customTitles ? { args: { customPack: { titles: customTitles } } } : null;
  }

  /** "Bad card" target for the last title of a finished turn (built-in titles only). */
  function lastCard(last) {
    if (!last) return null;
    const t = last.missed || last.got[last.got.length - 1] || last.passed[last.passed.length - 1];
    return t && t.key && String(t.key).indexOf('x:') !== 0 ? { game: GAME, key: t.key, label: t.en } : null;
  }

  function loadNames() {
    return Kit().passNightNames ? Kit().passNightNames(Core().MIN_PLAYERS, Core().MAX_PLAYERS) : null;
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadTeams() {
    const night = loadNames();
    if (night) return [night.filter((n, i) => i % 2 === 0), night.filter((n, i) => i % 2 === 1)];
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
    return s.goal === 'points' ? t('games.charades.first_to_targetpoints', { targetPoints: s.targetPoints }) : t('games.charades.turnsperteam_turns_each', { turnsPerTeam: s.turnsPerTeam });
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
      <summary>${tHtml('games.charades.how_to_play_20_seconds')}</summary>
      <ol>
        <li>${tHtml('games.charades.howto_teams')}</li>
        <li>${tHtml('games.charades.the_actor_secretly_sees_a_title')} <strong>${tHtml('games.charades.no_talking_no_mouthing')}</strong>.</li>
        <li>${tHtml('games.charades.teammates_shout_guesses_before_the_timer')} <strong>${tHtml('games.charades.got_it')}</strong> ${tHtml('games.charades.for_1')}</li>
        <li>${tHtml('games.charades.stuck')} <strong>${tHtml('games.charades.pass')}</strong> ${tHtml('games.charades.for_a_new_title_1_per')}</li>
      </ol>
      <div class="pk-howto-score">${tHtml('games.charades.gesture_cheat_sheet')}</div>
      ${gesturesHtml()}
    </details>`;
  }

  function openGestures() {
    Kit().openSheet({ title: t('games.charades.gestures'), bodyHtml: gesturesHtml() + '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-ok>' + tHtml('games.charades.got_it_2') + '</button>', onMount: (sheet, close) => sheet.querySelector('[data-ok]').addEventListener('click', close) });
  }

  /** The actor's private title card. */
  function titleCardHtml(t, extra) {
    if (!t) return '<div class="ch-card ch-card--empty">' + tHtml('games.charades.dealing') + '</div>';
    const pack = Core().packs.getPack(t.pack);
    const primary = primaryOf(t);
    const secondary = primary !== t.en ? t.en : '';
    return `<div class="ch-card">
      <div class="ch-card-kind">${esc(KIND[t.kind] || '🎭')} · ${esc(pack ? packLabel(pack) : '')}</div>
      <div class="ch-card-title">${esc(primary)}</div>
      ${secondary && secondary !== primary ? `<div class="ch-card-alt">${esc(secondary)}</div>` : ''}
      <div class="ch-card-diff ch-card-diff--${esc(t.difficulty)}">${esc(DIFF[t.difficulty] || t.difficulty)}</div>
      ${extra || '<div class="ch-card-tip">' + tHtml('games.charades.act_it_out_no_talking') + '</div>'}
    </div>`;
  }

  function titleText(t) {
    return t ? primaryOf(t) : '';
  }

  // ---------------- settings ----------------

  function openCategoryPicker(current, onSave) {
    const sel = new Set(current || []);
    const P = Core().packs;
    const tile = (p) => `<label class="im-pack ch-cat"><input type="checkbox" data-cat="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}>
          <span class="im-pack-icon" aria-hidden="true">${esc(p.icon)}</span>
          <span class="im-pack-name">${esc(packLabel(p))}</span>
          <span class="im-pack-count">${p.titles.length}</span></label>`;
    Kit().openSheet({
      title: t('games.charades.categories'),
      bodyHtml: `<div class="im-packs ch-cats">${P.PACKS.filter((p) => !p.regional).map(tile).join('')}</div>
      <div class="pk-section">${tHtml('games.charades.india_packs_optional')}</div>
      <div class="im-packs ch-cats">${P.PACKS.filter((p) => p.regional).map(tile).join('')}</div>
      <div class="pk-field-help" data-cat-err></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          const ids = Array.from(sheet.querySelectorAll('[data-cat]:checked')).map((el) => el.dataset.cat);
          if (!ids.length) {
            sheet.querySelector('[data-cat-err]').textContent = t('games.charades.pick_at_least_one_category');
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
      title: t('games.charades.game_settings'),
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.charades.time_per_turn')}</div>
          ${K.segHtml('turnSec', s.turnSec, C.TURN_SEC.map((v) => [v, v + 's']))}
        </div>
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.charades.game_length')}</div>
          ${K.segHtml('goal', s.goal, /* i18n-copy */ [['turns', t('games.charades.turns_each')], ['points', t('games.charades.first_to')]])}
          <div data-goal-turns>${K.segHtml('turnsPerTeam', s.turnsPerTeam, C.TURNS_PER_TEAM.map((v) => [v, String(v)]))}</div>
          <div data-goal-points>${K.segHtml('targetPoints', s.targetPoints, C.TARGETS.map((v) => [v, v + ' pts']))}</div>
        </div>
        <button type="button" class="im-pack-row" data-cats>${tHtml('games.charades.categories_2')} <strong data-cats-n>${customTitles ? tHtml('games.charades.your_pack') : (s.categories || []).length}</strong> <span class="im-chev">›</span></button>
        ${
          K.aiOn() || K.savedPacks(GAME).length || customTitles
            ? `<button type="button" class="pk-row-btn" data-make>${customTitles ? tHtml('games.charades.your_pack_customtitlescount_titles', { customTitlesCount: customTitles.length }) : K.aiOn() ? tHtml('games.charades.make_a_pack_about') : tHtml('games.charades.your_saved_packs')}<span class="pk-chev" aria-hidden="true">›</span></button>`
            : ''
        }
        <details class="pk-advanced">
          <summary>${tHtml('games.charades.advanced')}</summary>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.charades.rules.variant.passes.label')}</div>
            ${K.segHtml('passes', s.passes, [[0, t('games.charades.none')], [1, '1'], [2, '2'], [3, '3']])}
          </div>
          <div class="pk-field">
            <label class="pk-toggle"><input type="checkbox" data-speed ${s.speed ? 'checked' : ''}> ${tHtml('games.charades.speed_round_chain_titles_until_time')}</label>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.charades.difficulty')}</div>
            ${K.segHtml('difficulty', s.difficulty, /* i18n-copy */ [['all', t('games.charades.mixed')], ['easy', t('games.charades.easy')], ['medium', t('games.charades.medium')], ['hard', t('games.charades.hard')]])}
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
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
            s.region = ids.some((id) => (C.packs.getPack(id) || {}).regional) ? 'in' : 'global';
            customTitles = null;
            const n = sheet.querySelector('[data-cats-n]');
            if (n) n.textContent = String(ids.length);
          })
        );
        sheet.querySelector('[data-make]')?.addEventListener('click', () => {
          close();
          K.openPackSheet({
            game: GAME,
            kind: 'titles',
            min: C.CUSTOM_MIN || 4,
            onUse: (p) => {
              customTitles = p.items.map(String);
              opts.onSave(C.mergeSettings(s));
            },
          });
        });
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
      last.reason === 'got' ? t('games.charades.got_it_1') : last.reason === 'left' ? t('games.charades.the_actor_left') : last.points ? t('games.charades.time_s_up_points', { points: last.points }) : t('games.charades.time_s_up');
    return `<div class="ch-summary">
      <div class="pk-result-title">${esc(head)}</div>
      <div class="pk-sub">${tHtml('games.charades.actor_acted_for_team', { actor: nm(last.actor), team: Core().teamName(settings, last.team) })}</div>
      <div class="ch-titles">${got}${passed}${missed}</div>
    </div>`;
  }

  function finalHtml(st, settings, nm) {
    const title = st.winner === -1 ? t('games.charades.it_s_a_tie') : t('games.charades.teamname_win', { teamName: Core().teamName(settings, st.winner) });
    return `<div class="ch-final">
      <div class="pk-result-glyph" aria-hidden="true">${st.winner === -1 ? '🤝' : '🏆'}</div>
      <div class="pk-result-title">${esc(title)}</div>
      <div class="ch-final-score">${st.teamScores[0]} – ${st.teamScores[1]}</div>
      ${st.mvp ? `<div class="ch-mvp">${tHtml('games.charades.mvp_actor')} <strong>${esc(nm(st.mvp))}</strong></div>` : ''}
      ${scoreStripHtml(st, settings, nm)}
    </div>`;
  }

  function shareFinal(st, settings, nm) {
    const hi = Math.max(st.teamScores[0], st.teamScores[1]);
    const lo = Math.min(st.teamScores[0], st.teamScores[1]);
    const score = hi + '–' + lo;
    const head = st.winner === -1 ? t('games.charades.charades_ended_in_a_score_tie', { score }) : t('games.charades.teamname_won_charades_score', { teamName: Core().teamName(settings, st.winner), score });
    Kit().shareLine(GAME, LABEL, head + (st.mvp ? ' · MVP actor ' + nm(st.mvp) : '') + ' 🎭');
  }

  // ---------------- entry ----------------

  function open(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast(t('games.charades.label_is_still_loading_try_again', { LABEL }));
      return;
    }
    if ((c.source === 'chat_group' || c.isGroup) && c.chat) {
      startRoom({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('games.charades.party'), confirmLeave: () => false });
    if (c.mode === 'pass') renderPassSetup(shell);
    else renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '🎭',
        title: t('games.charades.act_it_out_no_talking_2'),
        sub: t('games.charades.4_16_players_two_teams_movies'),
        howToHtml: howToCardHtml(),
        roomSub: t('games.charades.together_or_on_a_video_call'),
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
        <div class="pk-title">${tHtml('games.charades.pick_teams')}</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="${tHtml('games.charades.game_settings')}">⚙︎</button>
      </div>
      <div data-editor></div>
      <div class="pk-meta" data-meta></div>
      <div class="im-error" data-err role="alert"></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${tHtml('games.charades.start')}</button>
    </div>`);
    shell.setBack(() => renderHome(shell));
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
        body.querySelector('[data-err]').textContent = t('games.charades.each_team_needs_at_least_2');
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
      Kit().refreshRetired(GAME);
      const game = Core().createGame(teams, settings, { lang: lang(), custom: customTitles, exclude: Kit().retiredCached(GAME) });
      const session = { players, settings: game.settings, pub: game.pub, hidden: game.hidden };
      shell.guard = true;
      renderPassReady(shell, session);
    });
  }

  function passNm(session) {
    return (id) => session.players[id] || t('common.someone');
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
    shell.setSubtitle(t('games.charades.turn_turnno', { turnNo: st.turnNo }));
    const body = shell.render(`<div class="pk-page">
      ${scoreStripHtml(st, session.settings, nm)}
      <div class="pk-progress">${tHtml('games.charades.team_actor', { team: Core().teamName(session.settings, st.team) })}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      lead: t('games.charades.hand_the_phone_to'),
      name: nm(st.actor),
      revealHtml: () => titleCardHtml(Core().reveal(session.hidden.current)),
      doneLabel: t('games.charades.start_timer'),
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
      <div class="pk-progress">${tHtml('games.charades.name_is_acting', { name: bidi(nm(st.actor)) })}</div>
      <div class="pk-timer ch-timer" data-timer></div>
      ${s.speed ? `<div class="ch-counter">${tHtml('games.charades.got_turngotcount_this_turn', { turnGotCount: st.turnGot.length })}</div>` : ''}
      ${notice ? `<div class="ch-notice" role="status">${esc(notice)}</div>` : ''}
      <button type="button" class="ch-got" data-got>${tHtml('games.charades.got_it')}</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-pass ${st.passesLeft > 0 ? '' : 'disabled'}>${tHtml('games.charades.pass_value', { value: s.passes ? t('games.charades.passesleft_left', { passesLeft: st.passesLeft }) : '' })}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-pause>${session.pausedLeft != null ? tHtml('common.shortcut_dangal_resume') : tHtml('dangal.party.pause')}</button>
      </div>
      <button type="button" class="pk-peek${notice ? ' is-nudge' : ''}" data-peek aria-label="${tHtml('games.charades.actor_hold_to_see_the_title_2')}">${tHtml('games.charades.actor_hold_to_see_the_title')}</button>
      <button type="button" class="pk-link" data-gestures>${tHtml('games.charades.gestures_2')}</button>
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
      if (session.pub.phase === 'acting') renderPassActing(shell, session, t('games.charades.new_title_hold_to_see_it'));
      else routePass(shell, session);
    });
    body.querySelector('[data-pass]').addEventListener('click', () => {
      if (!passAct(session, { type: 'pass' })) return;
      renderPassActing(shell, session, t('games.charades.new_title_hold_to_see_it'));
    });
  }

  function renderPassTurnEnd(shell, session) {
    const nm = passNm(session);
    const st = session.pub;
    if (session.clock) session.clock.stop();
    const nextTeam = 1 - st.team;
    const list = st.teams[nextTeam];
    const nextActor = list[st.actorIdx[nextTeam] % list.length];
    const card = lastCard(st.lastTurn);
    const body = shell.render(`<div class="pk-page">
      ${turnSummaryHtml(st.lastTurn, session.settings, nm)}
      ${scoreStripHtml(st, session.settings, nm)}
      <div class="pk-sub">${tHtml('games.charades.next_up_nextteam_nextactor_acts', { nextTeam: Core().teamName(session.settings, nextTeam), nextActor: nm(nextActor) })}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${tHtml('games.charades.next_turn')}</button>
      ${Kit().badCardHtml(card)}
    </div>`);
    if (card) Kit().wireBadCard(body, card);
    body.querySelector('[data-next]').addEventListener('click', () => {
      passAct(session, { type: 'next' });
      routePass(shell, session);
    });
  }

  function renderPassOver(shell, session) {
    const nm = passNm(session);
    const st = session.pub;
    if (session.clock) session.clock.stop();
    shell.guard = false;
    shell.setSubtitle(t('games.charades.final'));
    const roster = Object.keys(session.players).map((id) => ({ id, name: session.players[id] }));
    Kit().reportPass(GAME, { players: roster, scores: st.actorPoints || {}, state: { teams: st.teams, teamScores: st.teamScores, winner: st.winner } });
    const body = shell.render(`<div class="pk-page">
      ${turnSummaryHtml(st.lastTurn, session.settings, nm)}
      ${finalHtml(st, session.settings, nm)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${tHtml('games.charades.play_again')}</button>
      ${Kit().passHubButtonHtml()}
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>${tHtml('games.charades.teams_settings')}</button>
      </div>
    </div>`);
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    Kit().wirePassHub(body, shell);
    body.querySelector('[data-share]').addEventListener('click', () => shareFinal(st, session.settings, nm));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-again]').addEventListener('click', () => {
      const game = Core().createGame(st.teams, session.settings, { lang: lang(), custom: customTitles, exclude: Kit().retiredCached(GAME) });
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
      startArgs: () => startArgs(),
      lobbySummary: (ctrl) => {
        const s = Core().mergeSettings(ctrl.view.pub.settings);
        if (!s.categories) s.categories = Core().packs.defaultCategories(lang(), s.region);
        return customTitles && ctrl.isHost() ? metaLine(s).replace(/\d+ categor(y|ies)$/, 'your pack') : metaLine(s);
      },
      openSettings: (ctrl) => {
        const s = Core().mergeSettings(ctrl.view.pub.settings);
        if (!s.categories) s.categories = Core().packs.defaultCategories(lang(), s.region);
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
                  (p) => `<${isHost ? 'button type="button"' /* i18n-ignore */ : 'div'} class="pk-lobby-row ch-member" ${isHost ? `data-move="${esc(p.id)}" data-to="${1 - i}" aria-label="${tHtml('games.charades.move_name_to_other_team', { name: bidi(p.name) })}"` : ''}>
                  <span class="pk-dot" data-presence="${esc(p.id)}"></span>${Kit().identityHtml(p.seat || 0, p.name)}<span>${esc(p.name)}</span>${p.id === ctrl.view.pub.host ? '<span class="pk-badge">' + tHtml('games.charades.host') + '</span>' : ''}${p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">' + tHtml('common.you') + '</span>' : ''}${isHost ? '<span class="pk-chev" aria-hidden="true">⇄</span>' : ''}
                </${isHost ? 'button' : 'div'}>`
                )
                .join('')}
            </div>`
          )
          .join('')}</div>
          ${isHost ? '<div class="pk-hint">' + tHtml('games.charades.tap_a_player_to_switch_teams') + '</div><button type="button" class="pk-chip pk-teams-shuffle" data-shuffle>' + tHtml('games.charades.shuffle_teams') + '</button>' : ''}`;
      },
      onLobbyMount: (ctrl, body) => {
        body.querySelectorAll('[data-move]').forEach((btn) =>
          btn.addEventListener('click', () => ctrl.act('setTeam', { target: btn.dataset.move, team: Number(btn.dataset.to) }))
        );
        body.querySelector('[data-shuffle]')?.addEventListener('click', () => ctrl.act('shuffleTeams'));
      },
      canStart: (ctrl, players) => {
        if (players.length < Core().MIN_PLAYERS) return { ok: false, label: t('games.charades.need_value_more_to_start', { value: Core().MIN_PLAYERS - players.length }) };
        const teams = lobbyTeams(ctrl, players);
        if (teams.some((t) => t.length < Core().MIN_PER_TEAM)) return { ok: false, label: t('games.charades.each_team_needs_2_players') };
        return { ok: true, label: t('games.charades.start') };
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
    ctrl.shell.setSubtitle(t('games.charades.room_code_turn_turnno', { code: ctrl.view.code, turnNo: st.turnNo }));
    const timed = st.phase === 'ready' || st.phase === 'acting' || st.phase === 'turnEnd';
    const top = `${ctrl.hostBar(timed)}${ctrl.pausedNote()}${scoreStripHtml(st, s, nm)}`;
    const teamLabel = Core().teamName(s, st.team);

    if (st.phase === 'ready') {
      if (isActor) {
        const body = ctrl.render(`<div class="pk-page">${top}
          <div class="pk-progress">${tHtml('games.charades.you_re_acting_for_teamlabel', { teamLabel })}</div>
          <div data-cover></div>
          <div class="pk-timer" data-timer></div>
        </div>`);
        ctrl.wire(body);
        K.mountPassCover(body.querySelector('[data-cover]'), {
          lead: t('games.charades.your_title'),
          name: nm(me),
          revealHtml: () => titleCardHtml(sec && sec.title),
          doneLabel: t('games.charades.start_timer'),
          onDone: () => ctrl.act('go'),
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page">${top}
        <div class="pk-title">${tHtml('games.charades.name_is_up', { name: bidi(nm(st.actor)) })}</div>
        <div class="pk-sub">${esc(teamLabel)}${onTurn ? ' ' + tHtml('games.charades.that_s_your_team_get_ready') : ' ' + tHtml('games.charades.your_team_watches_this_one')}</div>
        <div class="pk-timer" data-timer></div>
      </div>`);
      ctrl.wire(body);
      return;
    }

    if (st.phase === 'acting') {
      const got = st.turnGot.map((t) => `<div class="ch-title-row is-got">✓ ${esc(titleText(t))}</div>`).join('');
      if (isActor) {
        const body = ctrl.render(`<div class="pk-page ch-acting">${top}
          <div class="pk-progress">${tHtml('games.charades.you_re_acting_no_talking')}</div>
          <div class="pk-timer ch-timer" data-timer></div>
          ${s.speed ? `<div class="ch-counter">${tHtml('games.charades.got_turngotcount_this_turn', { turnGotCount: st.turnGot.length })}</div>` : ''}
          <button type="button" class="ch-got" data-got>${tHtml('games.charades.got_it')}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-pass ${st.passesLeft > 0 ? '' : 'disabled'}>${tHtml('games.charades.pass_value', { value: s.passes ? t('games.charades.passesleft_left', { passesLeft: st.passesLeft }) : '' })}</button></div>
          <button type="button" class="pk-peek" data-peek aria-label="${tHtml('games.charades.hold_to_see_your_title_2')}">${tHtml('games.charades.hold_to_see_your_title')}</button>
          <button type="button" class="pk-link" data-gestures>${tHtml('games.charades.gestures_2')}</button>
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
        <div class="pk-progress">${tHtml('games.charades.actor_is_acting_for_teamlabel', { actor: nm(st.actor), teamLabel })}</div>
        <div class="pk-timer ch-timer" data-timer></div>
        ${
          onTurn
            ? `<div class="pk-sub">${tHtml('games.charades.shout_it_out_or_type_your')}</div>
               <div class="im-clue-form"><input class="pk-input" data-keep="guess" data-guess maxlength="80" placeholder="${tHtml('games.charades.your_guess')}" autocomplete="off" enterkeyhint="send" aria-label="${tHtml('games.charades.your_guess')}">
               <button type="button" class="pk-btn pk-btn--primary" data-send>${tHtml('games.charades.guess')}</button></div>
               <div class="im-error" data-err role="status"></div>`
            : '<div class="pk-wait">' + tHtml('games.charades.watch_and_enjoy_it_s_the') + '</div>'
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
          err.textContent = out.matched ? t('games.charades.you_got_it_1') : t('games.charades.not_quite_keep_going');
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
        <div class="pk-sub">${tHtml('games.charades.next_up_nextteam_value', { nextTeam: Core().teamName(s, nextTeam), value: nextActor ? t('games.charades.value_acts', { value: esc(nm(nextActor)) }) : '' })}</div>
        <div class="pk-timer" data-timer></div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${tHtml('games.charades.next_turn')}</button>
        ${K.badCardHtml(lastCard(st.lastTurn))}
      </div>`);
      ctrl.wire(body);
      if (lastCard(st.lastTurn)) K.wireBadCard(body, lastCard(st.lastTurn));
      body.querySelector('[data-next]').addEventListener('click', () => ctrl.act('nextTurn'));
      return;
    }

    if (st.phase === 'over') {
      const body = ctrl.render(`<div class="pk-page">
        ${turnSummaryHtml(st.lastTurn, s, nm)}
        ${finalHtml(st, s, nm)}
        ${K.roomResultActions(ctrl, { nextLabel: t('games.charades.play_again'), waitLabel: t('games.charades.waiting_for_the_host_to_start'), card: lastCard(st.lastTurn) })}
      </div>`);
      K.wireRoomResultActions(ctrl, body, { nextOp: 'start', onShare: () => shareFinal(st, s, nm), card: lastCard(st.lastTurn) });
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
      desc: t('games.charades.act_it_out_no_talking_two'),
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
        kit: t('games.charades.party_kit_js_pass_play_room'),
        dealing: 'party_room → server-lib/party-deal.js; only the actor reads the title',
        packs: 'data/charades-packs.js',
      },
      launch,
    });
  }

  window.openCharadesGame = launch;
})();
