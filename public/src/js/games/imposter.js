/**
 * Imposter — Dangal party game (G1). Everyone shares a secret word except the Imposter(s).
 *   Pass & Play: one phone, offline, no sign-in — ImposterCore runs locally.
 *   Room: each player on their own phone — server deals via party_room (server-lib/party-deal.js);
 *         this client only ever reads the shared state + its own secret.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'imposter';
  const LABEL = t('dangal.identity.imposter.label');
  const BILINGUAL_KEY = 'chaupaal_imposter_bilingual';
  const SETTINGS_KEY = 'chaupaal_imposter_settings';
  const NAMES_KEY = 'chaupaal_imposter_names';

  const Core = () => window.ImposterCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  function lang() {
    return typeof currentLang !== 'undefined' ? currentLang : 'en';
  }

  function bilingual() {
    try {
      return localStorage.getItem(BILINGUAL_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setBilingual(on) {
    try {
      localStorage.setItem(BILINGUAL_KEY, on ? '1' : '0');
    } catch (e) {}
  }

  function hiReader() {
    return String(lang()).indexOf('hi') === 0;
  }

  /** Global core by default; regional add-ons follow the locale until the host picks for themselves. */
  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch (e) {}
    const s = Object.assign({}, Core().DEFAULT_SETTINGS, saved);
    if (!saved.region) s.region = Kit().contentPrefs().region;
    s.mixRegional = s.region === 'in';
    if (s.pack === 'custom' && !customPack) s.pack = 'mixed';
    return s;
  }

  /** Host's own pack for tonight (AI draft or saved on this phone) — never uploaded unless dealt. */
  let customPack = null;
  function setCustom(p) {
    customPack = p ? { name: p.name, words: p.items } : null;
  }
  function customArgs(settings) {
    return settings && settings.pack === 'custom' && customPack ? { customPack } : {};
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadNames() {
    const night = Kit().passNightNames && Kit().passNightNames(Core().MIN_PLAYERS, Core().MAX_PLAYERS);
    if (night) return night;
    try {
      const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');
      if (Array.isArray(raw) && raw.length >= 3) return raw.slice(0, 12);
    } catch (e) {}
    const me = Kit().myName();
    return [me || '', '', ''];
  }

  function saveNames(names) {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 12)));
    } catch (e) {}
  }

  /** Room content language while a room is open (secret words follow it); '' → my UI language. */
  let roomContentLang = '';
  function contentLang() {
    return roomContentLang || lang();
  }

  function word(w) {
    return Core().wordLabel(w, contentLang(), bilingual());
  }

  function packLabel(p) {
    if (!p) return '';
    if (!hiReader() || !p.hi) return p.en;
    return bilingual() ? p.hi + ' · ' + p.en : p.hi;
  }

  /** Global core first, then the regional add-ons (always pickable, only mixed in when region = in). */
  function packChoices() {
    const P = Core().packs;
    const global = P.PACKS.filter((p) => !p.regional);
    const regional = P.PACKS.filter((p) => p.regional);
    return [P.MIXED].concat(global, regional);
  }

  const CUSTOM_PACK = { id: 'custom', en: t('games.imposter.your_pack'), hi: '', icon: '✨' };
  function packById(id) {
    if (id === 'custom' && customPack) return Object.assign({}, CUSTOM_PACK, { en: customPack.name || CUSTOM_PACK.en, words: customPack.words });
    return packChoices().find((p) => p.id === id) || Core().packs.MIXED;
  }

  /** The private card face. Undercover cards carry no role, so the odd one out can't tell. */
  function cardFaceHtml(secret) {
    if (!secret) return '<div class="im-card-empty">' + tHtml('games.imposter.dealing') + '</div>';
    if (secret.imposter) {
      const hint = secret.hint
        ? `<div class="im-card-hint">${tHtml('games.imposter.hint_hint', { hint: packLabel(secret.hint) })}</div>`
        : '<div class="im-card-hint">' + tHtml('games.imposter.no_hint_this_time') + '</div>';
      return `<div class="im-card im-card--imposter">
        <div class="im-card-role">🕵️</div>
        <div class="im-card-title">${tHtml('games.imposter.you_are_the_imposter')}</div>
        ${hint}
        <div class="im-card-tip">${tHtml('games.imposter.blend_in_listen_to_the_clues')}</div>
      </div>`;
    }
    return `<div class="im-card">
      <div class="im-card-label">${tHtml('games.imposter.your_secret_word')}</div>
      <div class="im-card-word">${esc(word(secret.word))}</div>
      <div class="im-card-tip">${tHtml('games.imposter.give_one_word_clues_don_t')}</div>
    </div>`;
  }

  // ---------------- settings sheet ----------------

  /**
   * Defaults up front; Advanced collapsed.
   * @param {object} settings
   * @param {{ room?: boolean, players: number, onSave: (s: object) => void }} opts
   */
  function openSettings(settings, opts) {
    const o = opts || {};
    const s = Object.assign({}, settings);
    const n = Math.max(3, o.players || 3);
    const maxImp = Core().maxImposters(n);
    const autoImp = Core().defaultImposterCount(n);
    const seg = (name, value, options) =>
      `<div class="pk-seg" role="radiogroup" data-seg="${name}">${options
        .map(
          ([v, label]) =>
            `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" class="pk-seg-btn${String(v) === String(value) ? ' is-on' : ''}" data-v="${esc(v)}">${esc(label)}</button>`
        )
        .join('')}</div>`;
    const impOptions = [[0, t('games.imposter.auto_n', { n: Math.min(autoImp, maxImp) })]];
    for (let i = 1; i <= maxImp; i++) impOptions.push([i, String(i)]);
    Kit().openSheet({
      title: t('games.imposter.game_settings'),
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.imposter.mode')}</div>
          ${seg('variant', s.variant, /* i18n-copy */ [['classic', t('games.imposter.classic')], ['undercover', t('games.imposter.rules.rules.3.h')]])}
          <div class="pk-field-help" data-variant-help></div>
        </div>
        <details class="pk-advanced">
          <summary>${tHtml('games.imposter.advanced')}</summary>
          <div class="pk-field" data-hint-field>
            <label class="pk-toggle"><input type="checkbox" data-hint ${s.hint ? 'checked' : ''}> ${tHtml('games.imposter.imposter_gets_a_one_word_hint')}</label>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.imposter.imposters')}</div>
            ${seg('imposters', s.imposters > maxImp ? 0 : s.imposters, impOptions)}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.imposter.clue_rounds')}</div>
            ${seg('circuits', s.circuits, [[1, '1 round'], [2, '2 rounds']])}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.imposter.discussion_timer')}</div>
            ${seg('discussionSec', s.discussionSec, [[0, t('games.imposter.off')], [60, '60s'], [90, '90s'], [120, '2 min'], [180, '3 min']])}
          </div>
          ${
            o.room
              ? `<div class="pk-field"><div class="pk-field-label">${tHtml('games.imposter.time_per_clue')}</div>${seg('clueSec', s.clueSec, [[30, '30s'], [45, '45s'], [60, '60s']])}</div>`
              : `<div class="pk-field"><div class="pk-field-label">${tHtml('games.imposter.rules.rules.2.h')}</div>${seg('voteStyle', s.voteStyle, /* i18n-copy */ [['group', t('games.imposter.point_together')], ['secret', t('games.imposter.secret_pass_around')]])}</div>`
          }
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.imposter.word_difficulty')}</div>
            ${seg('difficulty', s.difficulty || 'any', /* i18n-copy */ [['any', t('games.imposter.any')], ['easy', t('games.imposter.easier')], ['hard', t('games.imposter.harder')]])}
          </div>
          <div class="pk-field">
            <label class="pk-toggle"><input type="checkbox" data-region ${s.region === 'in' ? 'checked' : ''}> ${tHtml('games.imposter.mix_in_india_packs_bollywood_cricket')}</label>
          </div>
          ${
            hiReader()
              ? `<div class="pk-field"><label class="pk-toggle"><input type="checkbox" data-bilingual ${bilingual() ? 'checked' : ''}> ${tHtml('games.imposter.also_show_english_words')}</label></div>`
              : ''
          }
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
      onMount(sheet, close) {
        const help = sheet.querySelector('[data-variant-help]');
        const hintField = sheet.querySelector('[data-hint-field]');
        const paintHelp = () => {
          help.textContent =
            s.variant === 'undercover'
              ? t('games.imposter.the_imposter_gets_a_close_word')
              : t('games.imposter.the_imposter_knows_they_re_the');
          hintField.hidden = s.variant === 'undercover';
        };
        paintHelp();
        sheet.querySelectorAll('[data-seg]').forEach((grp) => {
          grp.querySelectorAll('.pk-seg-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              grp.querySelectorAll('.pk-seg-btn').forEach((b) => {
                b.classList.toggle('is-on', b === btn);
                b.setAttribute('aria-checked', String(b === btn));
              });
              const key = grp.dataset.seg;
              const v = btn.dataset.v;
              s[key] = key === 'variant' || key === 'voteStyle' || key === 'difficulty' ? v : Number(v);
              if (key === 'variant') paintHelp();
            });
          });
        });
        sheet.querySelector('[data-hint]')?.addEventListener('change', (e) => (s.hint = !!e.target.checked));
        sheet.querySelector('[data-bilingual]')?.addEventListener('change', (e) => setBilingual(!!e.target.checked));
        sheet.querySelector('[data-region]')?.addEventListener('change', (e) => {
          s.region = e.target.checked ? 'in' : 'global';
          s.mixRegional = s.region === 'in';
        });
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          close();
          o.onSave(Core().mergeSettings(s));
        });
      },
    });
  }

  function openPackPicker(current, onPick) {
    const tile = (p) => `<button type="button" class="im-pack${p.id === current ? ' is-on' : ''}" data-pack="${esc(p.id)}">
            <span class="im-pack-icon" aria-hidden="true">${esc(p.icon)}</span>
            <span class="im-pack-name">${esc(packLabel(p))}</span>
            <span class="im-pack-count">${p.words ? p.words.length + ' words' : tHtml('games.imposter.all_packs')}</span>
          </button>`;
    const choices = packChoices();
    const own = customPack ? [packById('custom')] : [];
    const showMake = Kit().aiOn() || Kit().savedPacks(GAME).length;
    Kit().openSheet({
      title: t('games.imposter.word_pack'),
      bodyHtml: `<div class="im-packs">${own.concat(choices.filter((p) => !p.regional)).map(tile).join('')}</div>
        <div class="pk-section">${tHtml('games.imposter.india_packs_optional')}</div>
        <div class="im-packs">${choices.filter((p) => p.regional).map(tile).join('')}</div>
        ${showMake ? `<button type="button" class="pk-row-btn" data-make>${Kit().aiOn() ? tHtml('games.imposter.make_a_pack_about') : tHtml('games.imposter.your_saved_packs')}<span class="pk-chev" aria-hidden="true">›</span></button>` : ''}`,
      onMount(sheet, close) {
        sheet.querySelectorAll('[data-pack]').forEach((btn) =>
          btn.addEventListener('click', () => {
            close();
            onPick(btn.dataset.pack);
          })
        );
        sheet.querySelector('[data-make]')?.addEventListener('click', () => {
          close();
          Kit().openPackSheet({
            game: GAME,
            kind: 'pairs',
            min: Core().CUSTOM_MIN || 4,
            onUse: (p) => {
              setCustom(p);
              onPick('custom');
            },
          });
        });
      },
    });
  }

  // ---------------- home ----------------

  function howToCardHtml() {
    return `<details class="im-howto">
      <summary>${tHtml('games.imposter.how_to_play_20_seconds')}</summary>
      <ol>
        <li>${tHtml('games.imposter.everyone_secretly_sees_the_same_word')} <strong>${tHtml('games.imposter.rules.ruleset.name')}</strong>.</li>
        <li>${tHtml('games.imposter.take_turns_saying')} <strong>${tHtml('games.imposter.one_word')}</strong> ${tHtml('games.imposter.about_it_not_the_word_not')}</li>
        <li>${tHtml('games.imposter.discuss_then_vote_out_who_you')}</li>
        <li>${tHtml('games.imposter.caught_imposters_get')} <strong>${tHtml('games.imposter.one_guess')}</strong> ${tHtml('games.imposter.at_the_word_to_steal_the')}</li>
      </ol>
      <div class="im-howto-score">${tHtml('games.imposter.crew_1_each_for_a_catch')}</div>
    </details>`;
  }

  function openImposter(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast(t('games.imposter.imposter_is_still_loading_try_again'));
      return;
    }
    const fromGroup = c.source === 'chat_group' || (c.isGroup && c.chat);
    if (fromGroup && c.chat) {
      startRoomFlow({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('games.imposter.party'), confirmLeave: () => false });
    if (c.mode === 'pass') renderPassSetup(shell);
    else renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(`<div class="im-home">
      <div class="im-hero">
        <div class="im-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🕵️'}</div>
        <div class="im-hero-title">${tHtml('games.imposter.who_s_faking_it')}</div>
        <div class="im-hero-sub">${tHtml('games.imposter.3_12_players_everyone_knows_the')}</div>
      </div>
      ${howToCardHtml()}
      <div class="im-modes">
        <button type="button" class="im-mode im-mode--primary" data-mode="pass">
          <span class="im-mode-title">${tHtml('games.imposter.pass_play')}</span><span class="im-mode-sub">${tHtml('games.imposter.one_phone_pass_it_around')}</span>
        </button>
        <button type="button" class="im-mode" data-mode="room">
          <span class="im-mode-title">${tHtml('games.imposter.play_with_friends')}</span><span class="im-mode-sub">${tHtml('games.imposter.everyone_on_their_own_phone')}</span>
        </button>
        <button type="button" class="im-link" data-mode="join">${tHtml('games.imposter.have_a_room_code_join')}</button>
        ${Kit().partyNightLinkHtml ? Kit().partyNightLinkHtml(GAME) : ''}
      </div>
    </div>`);
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => Kit().closeThen(shell, () => startRoomFlow({})));
    body.querySelector('[data-mode="join"]').addEventListener('click', () => Kit().closeThen(shell, openJoinByCode));
  }

  // ======================= PASS & PLAY =======================

  function renderPassSetup(shell) {
    const settings = loadSettings();
    const body = shell.render(`<div class="im-setup">
      <div class="im-setup-head">
        <div class="im-step-title">${tHtml('games.imposter.who_s_playing')}</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="${tHtml('games.imposter.game_settings')}">⚙︎</button>
      </div>
      <div data-editor></div>
      <button type="button" class="im-pack-row" data-pack-row></button>
      <div class="im-setup-meta" data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${tHtml('games.imposter.start')}</button>
    </div>`);
    shell.setBack(() => renderHome(shell));
    const editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), {
      names: loadNames(),
      min: Core().MIN_PLAYERS,
      max: Core().MAX_PLAYERS,
      onChange: () => paintMeta(),
    });
    const packRow = body.querySelector('[data-pack-row]');
    const paintPack = () => {
      const p = packById(settings.pack);
      packRow.innerHTML = `<span aria-hidden="true">${esc(p.icon)}</span> ${tHtml('games.imposter.words')} <strong>${esc(packLabel(p))}</strong> <span class="im-chev" aria-hidden="true">›</span>`;
    };
    const paintMeta = () => {
      const n = editor.count();
      const k = Core().resolveImposterCount(n, settings.imposters);
      const meta = body.querySelector('[data-meta]');
      if (!meta) return;
      meta.textContent =
        t('games.imposter.meta_line', { variant: settings.variant === 'undercover' ? t('games.imposter.variant_undercover') : t('games.imposter.variant_classic'), count: k }) +
        (settings.discussionSec ? t('games.imposter.discussionsec_s_talk', { discussionSec: settings.discussionSec }) : '');
    };
    paintPack();
    paintMeta();
    packRow.addEventListener('click', () =>
      openPackPicker(settings.pack, (id) => {
        settings.pack = id;
        saveSettings(settings);
        paintPack();
      })
    );
    body.querySelector('[data-settings]').addEventListener('click', () =>
      openSettings(settings, {
        players: editor.count(),
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
        usedKeys: [],
        settings: Core().mergeSettings(settings),
      };
      session.players.forEach((p) => (session.scores[p.id] = 0));
      Kit().refreshRetired(GAME);
      startPassRound(shell, session);
    });
  }

  function nameOf(session, id) {
    const p = session.players.find((x) => x.id === id);
    return p ? p.name : t('common.someone');
  }

  function startPassRound(shell, session) {
    const ids = session.players.map((p) => p.id);
    const custom = session.settings.pack === 'custom' && customPack ? Core().customPack(customPack) : null;
    const settings = custom || session.settings.pack !== 'custom' ? session.settings : Object.assign({}, session.settings, { pack: 'mixed' });
    const dealt = Core().deal(ids, settings, { usedKeys: session.usedKeys, exclude: Kit().retiredCached(GAME), custom });
    session.usedKeys.push(dealt.key);
    session.roundNo += 1;
    const starter = (session.roundNo - 1) % ids.length;
    session.round = {
      settings: dealt.settings,
      hidden: dealt.hidden,
      secrets: dealt.secrets,
      pub: Core().createRound(ids, dealt.settings, starter),
    };
    shell.setSubtitle(t('games.imposter.round_roundno', { roundNo: session.roundNo }));
    shell.guard = true;
    renderPassReveal(shell, session, 0);
  }

  function passAct(shell, session, action) {
    const r = session.round;
    const out = Core().applyAction(r.pub, r.hidden, r.settings, action);
    if (out.error) return false;
    r.pub = out.pub;
    routePass(shell, session);
    return true;
  }

  function routePass(shell, session) {
    const p = session.round.pub;
    if (p.phase === 'clues') renderPassClues(shell, session);
    else if (p.phase === 'discuss') renderPassDiscuss(shell, session);
    else if (p.phase === 'vote' || p.phase === 'revote') renderPassVote(shell, session);
    else if (p.phase === 'defence') renderPassDefence(shell, session);
    else if (p.phase === 'steal') renderPassSteal(shell, session);
    else if (p.phase === 'result') renderPassResult(shell, session);
  }

  /** Forward-only card handout — index only ever increases. */
  function renderPassReveal(shell, session, index) {
    const order = session.round.pub.players;
    if (index >= order.length) {
      session.round.secrets = null; // nothing left to re-reveal
      passAct(shell, session, { type: 'startClues' });
      return;
    }
    const id = order[index];
    const secret = session.round.secrets[id];
    const body = shell.render(`<div class="im-reveal">
      <div class="im-progress">${tHtml('games.imposter.card_value_of_ordercount', { value: index + 1, orderCount: order.length })}</div>
      <div data-cover></div>
    </div>`);
    Kit().mountPassCover(body.querySelector('[data-cover]'), {
      name: nameOf(session, id),
      revealHtml: () => cardFaceHtml(secret),
      doneLabel: index === order.length - 1 ? t('games.imposter.hide_start') : t('games.imposter.hide_pass'),
      onDone: () => renderPassReveal(shell, session, index + 1),
    });
  }

  function cluesListHtml(session, pub, names) {
    const nm = names || ((id) => nameOf(session, id));
    if (!pub.clues.length) return '';
    return `<div class="im-clues">${pub.clues
      .map(
        (c) => `<div class="im-clue${c.skipped ? ' is-skipped' : ''}"><span class="im-clue-who">${esc(nm(c.id))}</span><span class="im-clue-word">${
          c.skipped ? 'skipped' : c.text ? esc(c.text) : '🗣️'
        }</span></div>`
      )
      .join('')}</div>`;
  }

  function renderPassClues(shell, session) {
    const pub = session.round.pub;
    const giver = Core().currentClueGiver(pub);
    const n = pub.order.length;
    const circuit = Math.floor(pub.turn / n) + 1;
    const circuits = session.round.settings.circuits;
    const body = shell.render(`<div class="im-clue-turn">
      <div class="im-progress">${tHtml('games.imposter.clue_round_circuit_of_circuits_value', { circuit, circuits, value: (pub.turn % n) + 1, n })}</div>
      <div class="im-turn-name">${esc(nameOf(session, giver))}</div>
      <div class="im-turn-sub">${tHtml('games.imposter.say')} <strong>${tHtml('games.imposter.one_word')}</strong> ${tHtml('games.imposter.out_loud')}</div>
      <div class="im-rule">${tHtml('games.imposter.not_the_word_not_a_translation')}</div>
      <div class="im-order">${pub.order
        .map((id, i) => {
          const done = pub.turn >= n * (circuit - 1) + i + 1;
          return `<span class="im-order-chip${id === giver ? ' is-now' : ''}${done ? ' is-done' : ''}">${esc(nameOf(session, id))}</span>`;
        })
        .join('')}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${tHtml('games.imposter.said_it_next')}</button>
      <button type="button" class="im-link" data-skip-all>${tHtml('games.imposter.skip_to_discussion')}</button>
    </div>`);
    body.querySelector('[data-next]').addEventListener('click', () => passAct(shell, session, { type: 'spoken' }));
    body.querySelector('[data-skip-all]').addEventListener('click', () => passAct(shell, session, { type: 'startDiscussion' }));
  }

  function renderPassDiscuss(shell, session) {
    const secs = session.round.settings.discussionSec;
    if (!secs) {
      passAct(shell, session, { type: 'startVote' });
      return;
    }
    const body = shell.render(`<div class="im-discuss">
      <div class="im-step-title">${tHtml('common.discuss')}</div>
      <div class="im-turn-sub">${tHtml('games.imposter.who_sounded_like_they_didn_t')}</div>
      <div class="pk-timer" data-timer></div>
      <div class="im-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-pause>${tHtml('games.imposter.pause')}</button>
        <button type="button" class="pk-btn pk-btn--primary" data-vote>${tHtml('games.imposter.vote_now')}</button>
      </div>
    </div>`);
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      timer.stop();
      passAct(shell, session, { type: 'startVote' });
    };
    const timer = Kit().countdown(body.querySelector('[data-timer]'), { seconds: secs, onDone: go });
    const pauseBtn = body.querySelector('[data-pause]');
    pauseBtn.addEventListener('click', () => {
      if (timer.paused) {
        timer.resume();
        pauseBtn.textContent = t('games.imposter.pause');
      } else {
        timer.pause();
        pauseBtn.textContent = t('common.shortcut_dangal_resume');
      }
    });
    body.querySelector('[data-vote]').addEventListener('click', go);
  }

  function playersFor(session, ids) {
    return ids.map((id) => ({ id, name: nameOf(session, id) }));
  }

  function renderPassVote(shell, session) {
    const pub = session.round.pub;
    const style = session.round.settings.voteStyle;
    const revote = pub.phase === 'revote';
    const again = pub.voteRound > 1 && !revote;
    if (style === 'secret') {
      renderPassSecretVote(shell, session, 0);
      return;
    }
    const body = shell.render(`<div class="im-vote">
      <div class="im-step-title">${revote ? tHtml('games.imposter.revote') : again ? tHtml('games.imposter.another_imposter_is_out_there') : tHtml('games.imposter.vote')}</div>
      <div class="im-turn-sub">${
        revote ? tHtml('games.imposter.only_the_tied_players_are_up') : ''
      }${tHtml('games.imposter.point_on_three')}</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-accuse disabled>${tHtml('games.imposter.accuse')}</button>
      <button type="button" class="im-link" data-tie>${tHtml('games.imposter.it_s_a_tie')}</button>
    </div>`);
    let picked = null;
    const accuseBtn = body.querySelector('[data-accuse]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: playersFor(session, pub.candidates),
      onPick: (ids) => {
        picked = ids[0];
        accuseBtn.disabled = !picked;
        accuseBtn.textContent = t('games.imposter.accuse_nameof', { nameOf: nameOf(session, picked) });
      },
    });
    accuseBtn.addEventListener('click', () => picked && passAct(shell, session, { type: 'accuse', target: picked }));
    body.querySelector('[data-tie]').addEventListener('click', () => {
      if (revote) {
        passAct(shell, session, { type: 'declareTie', tied: pub.candidates.slice(0, 2) });
        return;
      }
      renderPassTiePick(shell, session);
    });
  }

  function renderPassTiePick(shell, session) {
    const pub = session.round.pub;
    const body = shell.render(`<div class="im-vote">
      <div class="im-step-title">${tHtml('games.imposter.who_tied')}</div>
      <div class="im-turn-sub">${tHtml('games.imposter.pick_everyone_with_the_most_votes')}</div>
      <div data-picker></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-ok disabled>${tHtml('games.imposter.give_them_a_defence')}</button>
      <button type="button" class="im-link" data-back>${tHtml('games.imposter.back_to_vote')}</button>
    </div>`);
    let tied = [];
    const ok = body.querySelector('[data-ok]');
    Kit().mountPicker(body.querySelector('[data-picker]'), {
      players: playersFor(session, pub.candidates),
      multi: true,
      onPick: (ids) => {
        tied = ids;
        ok.disabled = ids.length < 2;
      },
    });
    ok.addEventListener('click', () => passAct(shell, session, { type: 'declareTie', tied }));
    body.querySelector('[data-back]').addEventListener('click', () => renderPassVote(shell, session));
  }

  /** Secret vote: pass the phone to each voter in turn; votes stay hidden until the tally. */
  function renderPassSecretVote(shell, session, index) {
    const pub = session.round.pub;
    if (pub.phase !== 'vote' && pub.phase !== 'revote') {
      routePass(shell, session);
      return;
    }
    const voters = pub.voters;
    if (index >= voters.length) return;
    const voter = voters[index];
    const body = shell.render(`<div class="im-reveal">
      <div class="im-progress">${tHtml('games.imposter.value_value2_of_voterscount', { value: { html: pub.phase === 'revote' ? 'Revote' : tHtml('games.imposter.secret_vote') }, value2: index + 1, votersCount: voters.length })}</div>
      <div class="pk-pass">
        <div class="pk-pass-lead">${tHtml('games.imposter.pass_the_phone_to')}</div>
        <div class="pk-pass-name">${esc(nameOf(session, voter))}</div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-ready>${tHtml('games.imposter.im_name_vote', { name: bidi(nameOf(session, voter)) })}</button>
      </div>
    </div>`);
    body.querySelector('[data-ready]').addEventListener('click', () => {
      const b = shell.render(`<div class="im-vote">
        <div class="im-step-title">${tHtml('games.imposter.who_s_the_imposter')}</div>
        <div class="im-turn-sub">${tHtml('games.imposter.nobody_else_will_see_your_vote')}</div>
        <div data-picker></div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-cast disabled>${tHtml('games.imposter.vote_pass')}</button>
      </div>`);
      let target = null;
      const cast = b.querySelector('[data-cast]');
      Kit().mountPicker(b.querySelector('[data-picker]'), {
        players: playersFor(session, pub.candidates),
        exclude: [voter],
        onPick: (ids) => {
          target = ids[0];
          cast.disabled = !target;
        },
      });
      cast.addEventListener('click', () => {
        const r = session.round;
        const out = Core().applyAction(r.pub, r.hidden, r.settings, { type: 'vote', id: voter, target });
        if (out.error) return;
        r.pub = out.pub;
        if (r.pub.phase === 'vote' || r.pub.phase === 'revote') {
          if (r.pub.voted.length < r.pub.voters.length) {
            renderPassSecretVote(shell, session, index + 1);
            return;
          }
        }
        renderPassTally(shell, session);
      });
    });
  }

  function renderPassTally(shell, session) {
    const pub = session.round.pub;
    const t = pub.lastTally;
    if (!t) {
      routePass(shell, session);
      return;
    }
    const rows = Object.keys(t.counts)
      .sort((a, b) => t.counts[b] - t.counts[a])
      .map((id) => `<div class="im-tally-row"><span>${esc(nameOf(session, id))}</span><strong>${t.counts[id]}</strong></div>`)
      .join('');
    const body = shell.render(`<div class="im-vote">
      <div class="im-step-title">${tHtml('games.imposter.the_votes_are_in')}</div>
      <div class="im-tally">${rows}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${tHtml('games.imposter.continue')}</button>
    </div>`);
    body.querySelector('[data-go]').addEventListener('click', () => routePass(shell, session));
  }

  function renderPassDefence(shell, session) {
    const pub = session.round.pub;
    const secs = session.round.settings.defenceSec;
    const body = shell.render(`<div class="im-discuss">
      <div class="im-step-title">${tHtml('games.imposter.it_s_a_tie')}</div>
      <div class="im-turn-sub">${tHtml('games.imposter.tied_defence', { names: pub.tied.map((id) => nameOf(session, id)).join(t('dangal.vs_join')) })}</div>
      <div class="pk-timer" data-timer></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${tHtml('games.imposter.revote')}</button>
    </div>`);
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      timer.stop();
      passAct(shell, session, { type: 'endDefence' });
    };
    const timer = Kit().countdown(body.querySelector('[data-timer]'), { seconds: secs, onDone: go });
    body.querySelector('[data-go]').addEventListener('click', go);
  }

  function renderPassSteal(shell, session) {
    const r = session.round;
    const pub = r.pub;
    const who = nameOf(session, pub.stealer);
    const undercover = r.settings.variant === 'undercover';
    const body = shell.render(`<div class="im-steal">
      <div class="im-caught">🎯</div>
      <div class="im-step-title">${esc(who)} ${undercover ? tHtml('games.imposter.was_the_odd_one_out') : tHtml('games.imposter.was_an_imposter')}</div>
      <div class="im-turn-sub">${tHtml('games.imposter.who_one_guess_to_steal_the', { who, value: { html: undercover ? tHtml('games.imposter.what_was_everyone_else_s_word') : tHtml('games.imposter.what_s_the_secret_word') } })}</div>
      <input class="pk-input" data-guess maxlength="40" placeholder="${tHtml('games.imposter.type_the_word_or_say_it')}" autocomplete="off" enterkeyhint="done">
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-check>${tHtml('games.imposter.check_guess')}</button>
      <button type="button" class="im-link" data-spoken>${tHtml('games.imposter.they_said_it_out_loud')}</button>
    </div>`);
    const input = body.querySelector('[data-guess]');
    const check = (spoken) => {
      const guess = spoken ? '' : input.value.trim();
      if (!spoken && !guess) {
        input.focus();
        return;
      }
      const auto = guess ? Core().matchGuess(guess, r.hidden.majority, contentLang()) : false;
      const b = shell.render(`<div class="im-steal">
        <div class="im-step-title">${tHtml('games.imposter.the_word_was')}</div>
        <div class="im-card-word">${esc(word(r.hidden.majority))}</div>
        ${guess ? `<div class="im-turn-sub">${tHtml('games.imposter.who_guessed_guess_value', { who, guess, value: { html: auto ? tHtml('games.imposter.looks_right') : tHtml('games.imposter.looks_wrong') } })}</div>` : `<div class="im-turn-sub">${tHtml('games.imposter.did_who_say_it', { who })}</div>`}
        <div class="im-row">
          <button type="button" class="pk-btn ${auto ? 'pk-btn--primary' : 'pk-btn--ghost'}" data-accept>${tHtml('games.imposter.group_accepts')}</button>
          <button type="button" class="pk-btn ${auto ? 'pk-btn--ghost' : 'pk-btn--primary'}" data-reject>${tHtml('games.imposter.group_rejects')}</button>
        </div>
      </div>`);
      b.querySelector('[data-accept]').addEventListener('click', () => passAct(shell, session, { type: 'stealVerdict', ok: true, guess }));
      b.querySelector('[data-reject]').addEventListener('click', () => passAct(shell, session, { type: 'stealVerdict', ok: false, guess }));
    };
    body.querySelector('[data-check]').addEventListener('click', () => check(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') check(false);
    });
    body.querySelector('[data-spoken]').addEventListener('click', () => check(true));
  }

  function renderPassResult(shell, session) {
    const res = session.round.pub.result;
    if (!session.round.scored) {
      session.round.scored = true;
      Object.keys(res.points).forEach((id) => (session.scores[id] = (session.scores[id] || 0) + res.points[id]));
    }
    Kit().reportPass(GAME, { players: session.players, scores: session.scores });
    const lastKey = session.usedKeys[session.usedKeys.length - 1] || '';
    const card = lastKey && !/^custom/.test(lastKey) ? { game: GAME, key: lastKey, label: res.majority && res.majority.en } : null;
    const body = shell.render(resultHtml(res, (id) => nameOf(session, id), session.round.settings, {
      scoreboard: Kit().scoreboardHtml(session.players, session.scores, res.points),
      tally: null,
    }) + `<div class="im-result-actions">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${tHtml('games.imposter.next_round')}</button>
        ${Kit().passHubButtonHtml()}
        <div class="im-row">
          <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-setup>${tHtml('games.imposter.players_settings')}</button>
        </div>
        ${Kit().badCardHtml(card)}
      </div>`);
    Kit().wirePassHub(body, shell);
    if (card) Kit().wireBadCard(body, card);
    body.querySelector('[data-next]').addEventListener('click', () => startPassRound(shell, session));
    body.querySelector('[data-share]').addEventListener('click', () => shareResult(res, (id) => nameOf(session, id)));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    try {
      if (typeof gameFeedback === 'function') gameFeedback(res.winner === 'crew' ? 'win' : 'select');
    } catch (e) {}
  }

  // ---------------- shared result ----------------

  function resultHeadline(res, nm) {
    const imps = res.imposters.map(nm);
    const stole = res.caught.find((c) => c.stealOk);
    if (stole) return { glyph: '😈', title: t('games.imposter.nm_stole_the_win', { nm: nm(stole.id) }), sub: t('games.imposter.caught_but_guessed_the_word') };
    if (res.survivors.length) {
      const who = res.survivors.map(nm).join(' & ');
      const why =
        res.reason === 'wrong_accused' ? t('games.imposter.the_group_voted_out_the_wrong') : t('games.imposter.nobody_could_agree_the_imposter_slipped');
      return { glyph: '🕵️', title: t('games.imposter.who_fooled_everyone', { who }), sub: why };
    }
    return { glyph: '🎉', title: t('games.imposter.crew_wins'), sub: t('games.imposter.imposters_caught', { count: imps.length, names: imps.join(' & ') }) };
  }

  function resultHtml(res, nm, settings, extra) {
    const h = resultHeadline(res, nm);
    const x = extra || {};
    const words = res.minority
      ? `<div class="im-words"><div><span>${tHtml('games.imposter.crew_word')}</span><strong>${esc(word(res.majority))}</strong></div><div><span>${tHtml('games.imposter.imposter_word')}</span><strong>${esc(word(res.minority))}</strong></div></div>`
      : `<div class="im-words"><div><span>${tHtml('games.imposter.the_word')}</span><strong>${esc(word(res.majority))}</strong></div>${
          res.category ? `<div><span>${tHtml('common.feedback_category')}</span><strong>${esc(packLabel(res.category))}</strong></div>` : ''
        }</div>`;
    const steals = res.caught
      .filter((c) => c.guess != null || c.stealOk != null)
      .map(
        (c) =>
          `<div class="im-steal-line">${tHtml('games.imposter.id_guessed_value_value2', { id: nm(c.id), value: { html: c.guess ? '“' + esc(c.guess) + '”' : tHtml('games.imposter.out_loud') }, value2: { html: c.overridden ? (c.stealOk ? tHtml('games.imposter.group_accepted') : tHtml('games.imposter.group_said_no')) : c.stealOk ? 'correct 😈' : 'wrong' } })}</div>`
      )
      .join('');
    return `<div class="im-result">
      <div class="im-result-glyph" aria-hidden="true">${h.glyph}</div>
      <div class="im-result-title">${esc(h.title)}</div>
      <div class="im-result-sub">${esc(h.sub)}</div>
      ${words}
      <div class="im-result-imps">${res.imposters.length > 1 ? tHtml('games.imposter.imposters') : tHtml('games.imposter.rules.ruleset.name')}: <strong>${res.imposters.map((id) => esc(nm(id))).join(', ')}</strong></div>
      ${steals}
      ${x.tally || ''}
      <div class="im-section-label">${tHtml('games.imposter.scores')}</div>
      ${x.scoreboard || ''}
    </div>`;
  }

  function shareResult(res, nm) {
    const stole = res.caught.find((c) => c.stealOk);
    let line;
    if (stole) line = t('games.imposter.nm_got_caught_but_stole_the', { nm: nm(stole.id) });
    else if (res.survivors.length) line = t('games.imposter.value_fooled_everyone_as_the_imposter', { value: res.survivors.map(nm).join(' & ') });
    else line = t('games.imposter.we_caught_the_imposter_value', { value: res.imposters.map(nm).join(' & ') });
    const text = line + ' — play Imposter on Chaupaal';
    const url = location.origin + '/';
    const stats =
      typeof buildShareStats === 'function'
        ? buildShareStats({ scoreLine: line, meta: t('games.imposter.imposter_party_game'), text, url, caption: line })
        : { scoreLine: line, meta: t('games.imposter.rules.ruleset.name'), text, url };
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({ gameId: GAME, title: t('common.share'), subtitle: line, stats });
    } else if (typeof shareGameResult === 'function') {
      shareGameResult(GAME, stats);
    }
  }

  // ======================= ROOM =======================

  function requireSignIn() {
    if (Kit().isSignedIn()) return true;
    if (typeof showToast === 'function') showToast(t('games.imposter.sign_in_to_play_on_separate'));
    if (typeof openAuthSheet === 'function') openAuthSheet('login');
    return false;
  }

  async function startRoomFlow(opts) {
    const o = opts || {};
    if (!requireSignIn()) return;
    if (navigator.onLine === false) {
      if (typeof showToast === 'function') showToast(t('games.imposter.you_re_offline_pass_play_works'));
      return;
    }
    const settings = loadSettings();
    try {
      const chatId = o.chat ? o.chat.firestoreId || o.chat.id : '';
      const res = await Kit().roomCall(GAME, 'create', {
        name: Kit().myName() || t('games.imposter.host'),
        settings: Object.assign({ contentLang: Kit().uiContentLang ? Kit().uiContentLang() : 'en' }, settings),
        chatId: chatId && chatId !== 'ai' ? chatId : '',
      });
      if (o.chat && chatId && chatId !== 'ai') {
        const sent = await Kit().postInviteToChat(o.chat, GAME, res.code, LABEL);
        if (sent && typeof showToast === 'function') showToast(t('games.imposter.invite_posted_in_the_chat'));
      }
      openRoom(res.code, { host: true });
    } catch (e) {
      if (typeof showToast === 'function') showToast(Kit().roomErrorText(e) || t('games.imposter.couldn_t_create_a_room'));
    }
  }

  function openJoinByCode() {
    if (!requireSignIn()) return;
    Kit().openSheet({
      title: t('games.imposter.join_a_room'),
      bodyHtml: `<input class="pk-input pk-input--code" data-code maxlength="6" placeholder="${tHtml('games.imposter.room_code')}" autocapitalize="characters" autocomplete="off" enterkeyhint="go" aria-label="${tHtml('games.imposter.room_code_2')}">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-join>${tHtml('games.imposter.join')}</button>`,
      onMount(sheet, close) {
        const input = sheet.querySelector('[data-code]');
        setTimeout(() => input.focus(), 50);
        const go = () => {
          const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 6) {
            if (typeof showToast === 'function') showToast(t('games.imposter.room_codes_are_6_letters_and'));
            return;
          }
          close();
          openRoom(code, { join: true });
        };
        input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        sheet.querySelector('[data-join]').addEventListener('click', go);
      },
    });
  }

  async function openRoom(code, opts) {
    const o = opts || {};
    if (!requireSignIn()) return;
    if (o.join) {
      try {
        const res = await Kit().roomCall(GAME, 'join', { code, name: Kit().myName() || t('dangal.party.player') });
        if (res.pending && typeof showToast === 'function') showToast(t('games.imposter.round_in_progress_you_ll_be'));
      } catch (e) {
        if (typeof showToast === 'function') showToast(Kit().roomErrorText(e) || t('games.imposter.couldn_t_join_that_room'));
        return;
      }
    }
    const view = { code, pub: null, secret: null, presence: {}, key: '', timer: null, seenSent: 0, busy: false };
    let conn = null;
    const shell = Kit().openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: t('games.imposter.room_code_3', { code }),
      confirmLeave: () => !!(view.pub && view.pub.status === 'playing'),
      leaveBody: t('games.imposter.you_can_rejoin_from_the_invite'),
      onClose: () => {
        roomContentLang = '';
        if (conn) conn.stop();
      },
    });
    conn = Kit().connectRoom(GAME, code, {
      onPub: (pub) => {
        view.pub = pub;
        roomContentLang = (pub && pub.settings && pub.settings.contentLang) || '';
        if (roomContentLang && Kit().ensureContentLocale) Kit().ensureContentLocale(GAME, roomContentLang).then(() => view.pub === pub && paintRoom(shell, conn, view));
        paintRoom(shell, conn, view);
      },
      onSecret: (secret) => {
        view.secret = secret;
        paintRoom(shell, conn, view, true);
      },
      onPresence: (p) => {
        view.presence = p;
        paintPresence(shell, view);
      },
    });
    if (!conn) {
      shell.render('<div class="im-empty">' + tHtml('games.imposter.can_t_reach_the_game_server') + '</div>');
      return;
    }
    shell.render('<div class="im-empty">' + tHtml('games.imposter.joining_room') + '</div>');
  }

  function roomName(view, id) {
    const p = view.pub && view.pub.players && view.pub.players[id];
    return p ? p.name : t('dangal.party.player');
  }

  function roomPlayers(view) {
    const players = (view.pub && view.pub.players) || {};
    return Object.keys(players)
      .sort((a, b) => (players[a].seat || 0) - (players[b].seat || 0))
      .map((id) => Object.assign({ id }, players[id]));
  }

  function paintPresence(shell, view) {
    shell.el.querySelectorAll('[data-presence]').forEach((dot) => {
      dot.classList.toggle('is-online', Kit().isOnline(view.presence, dot.dataset.presence));
    });
  }

  async function act(conn, view, op, args, errEl) {
    if (view.busy) return false;
    view.busy = true;
    try {
      await conn.op(op, args);
      return true;
    } catch (e) {
      const code = String(e.code || '');
      let msg = Kit().roomErrorText(e);
      if (/^CLUE_/.test(code)) {
        const reason = code.slice(5).toLowerCase();
        msg = Core().CLUE_REASON_COPY[reason] || t('games.imposter.try_a_different_clue');
      }
      if (errEl) errEl.textContent = msg || '';
      else if (msg && typeof showToast === 'function') showToast(msg);
      return false;
    } finally {
      view.busy = false;
    }
  }

  function paintRoom(shell, conn, view, secretChanged) {
    if (shell.closed) return;
    const pub = view.pub;
    if (!pub) {
      shell.render(`<div class="im-empty">${tHtml('games.imposter.this_room_isn_t_available_any')}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>${tHtml('games.imposter.back_to_games')}</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
      return;
    }
    const me = conn.uid;
    if (pub.status === 'closed') {
      shell.render(`<div class="im-empty">${pub.hub ? tHtml('games.imposter.back_to_the_party') : tHtml('games.imposter.the_host_closed_this_room')}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>${tHtml('common.done')}</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
      return;
    }
    if (!pub.players || !pub.players[me] || pub.players[me].left) {
      shell.render(`<div class="im-empty">${tHtml('games.imposter.you_re_no_longer_in_this')}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>${tHtml('common.done')}</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => shell.close());
      return;
    }
    const st = pub.status === 'playing' && pub.state ? Core().hydrateState(pub.state) : null;
    const key = [
      pub.status,
      pub.roundNo,
      st ? st.phase : '',
      st ? st.turn : '',
      st ? st.clues.length : '',
      st ? st.voted.length : '',
      st ? st.voteRound : '',
      st ? String(st.revote) : '',
      pub.host,
      pub.paused ? 'p' : '',
      Object.keys(pub.players).length,
      JSON.stringify(pub.seen || {}),
      JSON.stringify(pub.scores || {}),
      view.secret ? view.secret.roundNo : '',
      JSON.stringify(pub.settings || {}),
      JSON.stringify(pub.extended || null),
      pub.hub || '',
    ].join('|');
    if (key === view.key && !secretChanged) return;
    view.key = key;
    // Keep a half-typed clue / guess across re-renders.
    const typing = shell.el.querySelector('[data-keep]');
    const kept = typing ? { name: typing.dataset.keep, value: typing.value, focus: document.activeElement === typing } : null;
    if (pub.status === 'lobby' || !st) renderLobby(shell, conn, view);
    else if (pub.players[me].pending) renderPending(shell, conn, view, st);
    else renderRoomPhase(shell, conn, view, st);
    if (kept) {
      const again = shell.el.querySelector('[data-keep="' + kept.name + '"]');
      if (again) {
        again.value = kept.value;
        if (kept.focus) again.focus();
      }
    }
    paintPresence(shell, view);
  }

  function hostBar(conn, view, st) {
    const isHost = view.pub.host === conn.uid;
    if (!isHost || !st) return '';
    const timed = ['clues', 'discuss', 'vote', 'revote', 'defence', 'steal', 'reveal'].indexOf(st.phase) >= 0;
    if (!timed) return '';
    return `<div class="im-hostbar"><span>${tHtml('games.imposter.host')}</span>${
      view.pub.paused
        ? '<button type="button" class="pk-chip" data-host="resume">' + tHtml('common.shortcut_dangal_resume') + '</button>'
        : '<button type="button" class="pk-chip" data-host="pause">' + tHtml('games.imposter.pause') + '</button>'
    }${
      view.pub.deadline || view.pub.paused
        ? (view.pub.extended && view.pub.extended.key === String(view.pub.phaseKey || '') ? Number(view.pub.extended.n) || 0 : 0) < 3
          ? '<button type="button" class="pk-chip" data-host="addTime" aria-label="' + tHtml('games.imposter.add_30_seconds') + '">+30s</button>'
          : ''
        : ''
    }${st.phase === 'discuss' ? '<button type="button" class="pk-chip" data-host="skipDiscussion">' + tHtml('games.imposter.skip_to_vote') + '</button>' : ''}</div>`;
  }

  function wireHostBar(body, conn, view) {
    body.querySelectorAll('[data-host]').forEach((btn) =>
      btn.addEventListener('click', () => act(conn, view, btn.dataset.host))
    );
  }

  function renderLobby(shell, conn, view) {
    const pub = view.pub;
    const isHost = pub.host === conn.uid;
    const players = roomPlayers(view).filter((p) => !p.left);
    const s = Core().mergeSettings(pub.settings);
    const k = Core().resolveImposterCount(Math.max(3, players.length), s.imposters);
    const body = shell.render(`<div class="im-lobby">
      <div class="im-code-label">${tHtml('games.imposter.room_code_2')}</div>
      <div class="im-code" aria-label="${tHtml('dangal.room_code_value', { code: view.code })}">${esc(view.code)}</div>
      <div class="im-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('games.imposter.share_link')}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-invite>${tHtml('games.imposter.invite_friends')}</button>
      </div>
      <div class="im-section-label">${tHtml('games.imposter.in_the_room_playerscount_12', { playersCount: players.length })}</div>
      <div class="im-lobby-list">${players
        .map(
          (p, i) => `<div class="im-lobby-row"><span class="im-dot" data-presence="${esc(p.id)}"></span>${Kit().identityHtml(i, p.name)}<span>${esc(p.name)}</span>${
            p.id === pub.host ? '<span class="im-badge">' + tHtml('games.imposter.host') + '</span>' : ''
          }${p.id === conn.uid ? '<span class="im-badge im-badge--me">' + tHtml('common.you') + '</span>' : ''}</div>`
        )
        .join('')}</div>
      <button type="button" class="im-pack-row" data-settings ${isHost ? '' : 'disabled'}>
        ${esc(packById(s.pack).icon)} ${esc(packLabel(packById(s.pack)))} · ${s.variant === 'undercover' ? tHtml('games.imposter.variant_undercover') : tHtml('games.imposter.classic')} · ${tHtml('games.imposter.imposter_count', { count: k })}
        ${isHost ? '<span class="im-chev" aria-hidden="true">›</span>' : ''}
      </button>
      ${Kit().contentLangRowHtml ? Kit().contentLangRowHtml(GAME, pub.settings, isHost) : ''}
      ${
        isHost
          ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start ${players.length < 3 ? 'disabled' : ''}>${
              players.length < 3 ? tHtml('games.imposter.need_value_more_to_start', { value: 3 - players.length }) : tHtml('games.imposter.start')
            }</button>`
          : '<div class="im-wait">' + tHtml('games.imposter.waiting_for_the_host_to_start') + '</div>'
      }
      <button type="button" class="im-link" data-leave>${tHtml('games.imposter.leave_room')}</button>
    </div>`);
    body.querySelector('[data-share]').addEventListener('click', () => Kit().shareRoom(GAME, view.code, LABEL));
    body.querySelector('[data-invite]').addEventListener('click', () => Kit().inviteFriends(GAME, view.code, LABEL));
    body.querySelector('[data-leave]').addEventListener('click', async () => {
      await act(conn, view, 'leave');
      shell.close();
    });
    if (isHost) {
      body.querySelector('[data-settings]').addEventListener('click', () => openRoomSettings(conn, view, players.length));
      body.querySelector('[data-content-lang]')?.addEventListener('click', () => Kit().pickContentLang(GAME, pub.settings, (next) => act(conn, view, 'settings', { settings: { contentLang: next } })));
      body.querySelector('[data-start]')?.addEventListener('click', () => act(conn, view, 'start', customArgs(s)));
    }
  }

  function openRoomSettings(conn, view, n) {
    const s = Core().mergeSettings(view.pub.settings);
    Kit().openSheet({
      title: t('games.imposter.room_settings'),
      bodyHtml: `<button type="button" class="im-pack-row" data-pack>${esc(packById(s.pack).icon)} ${tHtml('games.imposter.words_pack', { pack: { html: '<strong>' + esc(packLabel(packById(s.pack))) + '</strong>' } })} <span class="im-chev">›</span></button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-more>${tHtml('games.imposter.mode_advanced')}</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-pack]').addEventListener('click', () => {
          close();
          openPackPicker(s.pack, (id) => {
            saveSettings(Object.assign(loadSettings(), { pack: id }));
            act(conn, view, 'settings', { settings: { pack: id } });
          });
        });
        sheet.querySelector('[data-more]').addEventListener('click', () => {
          close();
          openSettings(s, {
            room: true,
            players: n,
            onSave: (next) => {
              saveSettings(next);
              act(conn, view, 'settings', { settings: next });
            },
          });
        });
      },
    });
  }

  function renderPending(shell, conn, view, st) {
    const body = shell.render(`<div class="im-empty">
      <div class="im-step-title">${tHtml('games.imposter.round_in_progress')}</div>
      <div class="im-turn-sub">${tHtml('games.imposter.you_ll_be_dealt_in_when')}</div>
      ${cluesListHtml(null, st, (id) => roomName(view, id))}
      <button type="button" class="im-link" data-leave>${tHtml('games.imposter.leave_room')}</button>
    </div>`);
    body.querySelector('[data-leave]').addEventListener('click', async () => {
      await act(conn, view, 'leave');
      shell.close();
    });
  }

  function timerHtml() {
    return '<div class="pk-timer" data-timer></div>';
  }

  function mountRoomTimer(body, conn, view) {
    const el = body.querySelector('[data-timer]');
    if (!el) return;
    if (!view.pub.deadline && !view.pub.paused) {
      el.hidden = true;
      return;
    }
    Kit().countdown(el, {
      getEndsAt: () => conn.localDeadline(),
      getPausedMs: () => (view.pub && view.pub.paused ? Number(view.pub.paused.remaining) || 0 : null),
    });
  }

  function peekHtml() {
    return `<button type="button" class="im-peek" data-peek aria-label="${tHtml('games.imposter.hold_to_peek_at_your_card_2')}">${tHtml('games.imposter.hold_to_peek_at_your_card')}</button>`;
  }

  function wirePeek(body, view) {
    const btn = body.querySelector('[data-peek]');
    if (!btn) return;
    let tip = null;
    const show = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (tip) return;
      tip = document.createElement('div');
      tip.className = 'im-peek-card';
      tip.innerHTML = cardFaceHtml(view.secret);
      btn.after(tip);
    };
    const hide = () => {
      if (tip) tip.remove();
      tip = null;
    };
    btn.addEventListener('pointerdown', show);
    btn.addEventListener('pointerup', hide);
    btn.addEventListener('pointerleave', hide);
    btn.addEventListener('pointercancel', hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function renderRoomPhase(shell, conn, view, st) {
    const me = conn.uid;
    const nm = (id) => roomName(view, id);
    const pub = view.pub;
    const inRound = st.players.indexOf(me) >= 0;
    shell.setSubtitle(t('games.imposter.room_code_round_roundno', { code: view.code, roundNo: pub.roundNo }));
    const pausedNote = pub.paused ? '<div class="im-paused">' + tHtml('games.imposter.paused_by_the_host') + '</div>' : '';

    if (st.phase === 'reveal') {
      const ready = st.players.filter((id) => pub.seen && pub.seen[id]).length;
      const mine = !!(pub.seen && pub.seen[me]);
      const secretOk = view.secret && Number(view.secret.roundNo) === Number(pub.roundNo);
      if (mine || !inRound) {
        const body = shell.render(`<div class="im-reveal">
          ${hostBar(conn, view, st)}
          <div class="im-step-title">${tHtml('games.imposter.waiting_for_everyone_to_see_their')}</div>
          <div class="im-turn-sub">${tHtml('dangal.ready_of', { n: ready, total: st.players.length })}</div>
          ${timerHtml()}
          ${inRound ? peekHtml() : ''}
        </div>`);
        wireHostBar(body, conn, view);
        wirePeek(body, view);
        mountRoomTimer(body, conn, view);
        return;
      }
      const body = shell.render(`<div class="im-reveal">
        <div class="im-progress">${tHtml('games.imposter.round_roundno_ready_playerscount_ready', { roundNo: pub.roundNo, ready, playersCount: st.players.length })}</div>
        <div data-cover></div>
      </div>`);
      Kit().mountPassCover(body.querySelector('[data-cover]'), {
        lead: t('games.imposter.your_card'),
        name: nm(me),
        revealHtml: () => cardFaceHtml(secretOk ? view.secret : null),
        doneLabel: t('games.imposter.i_ve_seen_it'),
        onDone: () => act(conn, view, 'seen'),
      });
      return;
    }

    if (st.phase === 'clues') {
      const giver = Core().currentClueGiver(st);
      const n = st.order.length;
      const circuit = Math.floor(st.turn / n) + 1;
      const mine = giver === me;
      const body = shell.render(`<div class="im-room-clues">
        ${hostBar(conn, view, st)}
        <div class="im-progress">${tHtml('games.imposter.clue_round_circuit_of_value', { circuit, value: Core().mergeSettings(pub.settings).circuits })}</div>
        ${pausedNote}
        <div class="im-turn-name">${mine ? tHtml('games.imposter.your_turn') : esc(nm(giver)) + '’s turn'}</div>
        ${timerHtml()}
        ${cluesListHtml(null, st, nm)}
        ${
          mine
            ? `<div class="im-clue-form">
                <input class="pk-input" data-keep="clue" data-clue maxlength="24" placeholder="${tHtml('games.imposter.one_word_2')}" autocomplete="off" autocapitalize="off" enterkeyhint="send" aria-label="${tHtml('games.imposter.your_one_word_clue')}">
                <button type="button" class="pk-btn pk-btn--primary" data-send>${tHtml('common.send')}</button>
              </div>
              <div class="im-error" data-err role="alert"></div>
              <div class="im-rule">${tHtml('games.imposter.not_the_word_not_a_translation')}</div>`
            : '<div class="im-wait">' + tHtml('games.imposter.listen_closely') + '</div>'
        }
        ${inRound ? peekHtml() : ''}
      </div>`);
      wireHostBar(body, conn, view);
      wirePeek(body, view);
      mountRoomTimer(body, conn, view);
      if (mine) {
        const input = body.querySelector('[data-clue]');
        const err = body.querySelector('[data-err]');
        const send = async () => {
          const w = view.secret && view.secret.word ? view.secret.word : null;
          const v = Core().validateClue(input.value, { word: w, used: st.clues.map((c) => c.text).filter(Boolean) });
          if (!v.ok) {
            err.textContent = Core().CLUE_REASON_COPY[v.reason] || t('games.imposter.try_another_clue');
            return;
          }
          err.textContent = '';
          const ok = await act(conn, view, 'clue', { text: v.text }, err);
          if (ok) input.value = '';
        };
        body.querySelector('[data-send]').addEventListener('click', send);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && send());
        setTimeout(() => input.focus(), 60);
      }
      return;
    }

    if (st.phase === 'discuss') {
      const body = shell.render(`<div class="im-discuss">
        ${hostBar(conn, view, st)}
        <div class="im-step-title">${tHtml('common.discuss')}</div>
        ${pausedNote}
        <div class="im-turn-sub">${tHtml('games.imposter.who_sounded_like_they_didn_t')}</div>
        ${timerHtml()}
        ${cluesListHtml(null, st, nm)}
        ${inRound ? peekHtml() : ''}
      </div>`);
      wireHostBar(body, conn, view);
      wirePeek(body, view);
      mountRoomTimer(body, conn, view);
      return;
    }

    if (st.phase === 'vote' || st.phase === 'revote') {
      const canVote = st.voters.indexOf(me) >= 0;
      const voted = st.voted.indexOf(me) >= 0;
      const title = st.phase === 'revote' ? t('games.imposter.revote') : st.voteRound > 1 ? t('games.imposter.another_imposter_is_out_there') : t('games.imposter.vote');
      const body = shell.render(`<div class="im-vote">
        ${hostBar(conn, view, st)}
        <div class="im-step-title">${title}</div>
        ${pausedNote}
        ${timerHtml()}
        <div class="im-turn-sub">${tHtml('games.imposter.votedcount_voterscount_voted_value', { votedCount: st.voted.length, votersCount: st.voters.length, value: st.phase === 'revote' ? t('games.imposter.only_the_tied_players_are_up_2') : '' })}</div>
        ${
          canVote && !voted
            ? '<div data-picker></div><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-cast disabled>' + tHtml('games.imposter.lock_in_vote') + '</button>'
            : `<div class="im-wait">${voted ? tHtml('games.imposter.vote_locked_in_waiting_for_the') : tHtml('games.imposter.watching_the_vote')}</div>`
        }
        ${cluesListHtml(null, st, nm)}
      </div>`);
      wireHostBar(body, conn, view);
      mountRoomTimer(body, conn, view);
      if (canVote && !voted) {
        let target = null;
        const cast = body.querySelector('[data-cast]');
        Kit().mountPicker(body.querySelector('[data-picker]'), {
          players: st.candidates.map((id) => ({ id, name: nm(id) })),
          exclude: [me],
          onPick: (ids) => {
            target = ids[0];
            cast.disabled = !target;
            cast.textContent = t('games.imposter.vote_nm', { nm: nm(target) });
          },
        });
        cast.addEventListener('click', () => target && act(conn, view, 'vote', { target }));
      }
      return;
    }

    if (st.phase === 'defence') {
      const body = shell.render(`<div class="im-discuss">
        ${hostBar(conn, view, st)}
        <div class="im-step-title">${tHtml('games.imposter.it_s_a_tie')}</div>
        ${pausedNote}
        <div class="im-turn-sub">${tHtml('games.imposter.tied_defence_short', { names: st.tied.map((id) => nm(id)).join(t('dangal.vs_join')) })}</div>
        ${voteBreakdownHtml(st, nm)}
        ${timerHtml()}
      </div>`);
      wireHostBar(body, conn, view);
      mountRoomTimer(body, conn, view);
      return;
    }

    if (st.phase === 'steal') {
      const mine = st.stealer === me;
      const undercover = Core().mergeSettings(pub.settings).variant === 'undercover';
      const body = shell.render(`<div class="im-steal">
        ${hostBar(conn, view, st)}
        <div class="im-caught">🎯</div>
        <div class="im-step-title">${mine ? tHtml('dangal.classics.you') : esc(nm(st.stealer))} ${undercover ? (mine ? tHtml('games.imposter.were_the_odd_one_out') : tHtml('games.imposter.was_the_odd_one_out')) : mine ? tHtml('games.imposter.were_caught') : tHtml('games.imposter.was_an_imposter')}</div>
        ${voteBreakdownHtml(st, nm)}
        ${timerHtml()}
        ${
          mine
            ? `<div class="im-turn-sub">${tHtml('games.imposter.one_guess_to_steal_the_win', { value: { html: undercover ? tHtml('games.imposter.what_was_everyone_else_s_word') : tHtml('games.imposter.what_s_the_secret_word') } })}</div>
               <input class="pk-input" data-keep="guess" data-guess maxlength="40" placeholder="${tHtml('games.imposter.your_guess')}" autocomplete="off" enterkeyhint="send">
               <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-steal>${tHtml('games.imposter.guess')}</button>
               <div class="im-error" data-err role="alert"></div>`
            : `<div class="im-wait">${tHtml('games.imposter.name_is_guessing', { name: bidi(nm(st.stealer)) })}</div>`
        }
      </div>`);
      wireHostBar(body, conn, view);
      mountRoomTimer(body, conn, view);
      if (mine) {
        const input = body.querySelector('[data-guess]');
        const go = () => {
          if (!input.value.trim()) return input.focus();
          act(conn, view, 'steal', { guess: input.value.trim() }, body.querySelector('[data-err]'));
        };
        body.querySelector('[data-steal]').addEventListener('click', go);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        setTimeout(() => input.focus(), 60);
      }
      return;
    }

    if (st.phase === 'result' && st.result) {
      const res = st.result;
      const isHost = pub.host === me;
      const players = roomPlayers(view)
        .filter((p) => !p.left)
        .map((p) => ({ id: p.id, name: p.name }));
      const card = pub.settings && pub.settings.pack === 'custom' ? null : roomCard(res);
      const body = shell.render(
        resultHtml(res, nm, pub.settings, {
          scoreboard: Kit().scoreboardHtml(players, pub.scores, res.points),
          tally: voteBreakdownHtml(st, nm),
        }) +
          `<div class="im-result-actions">
            ${
              isHost
                ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>' + tHtml('games.imposter.next_round') + '</button>'
                : '<div class="im-wait">' + tHtml('games.imposter.waiting_for_the_host_to_deal') + '</div>'
            }
            <div class="im-row">
              <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
              ${isHost ? '<button type="button" class="pk-btn pk-btn--ghost" data-settings>' + tHtml('common.settings') + '</button>' : '<button type="button" class="pk-btn pk-btn--ghost" data-invite>' + tHtml('common.invite') + '</button>'}
            </div>
            ${Kit().badCardHtml(card)}
            <button type="button" class="im-link" data-leave>${isHost ? (pub.hub ? tHtml('dangal.party.back_to_party') : tHtml('dangal.party.end_room')) : tHtml('dangal.party.leave_room')}</button>
          </div>`
      );
      if (card) Kit().wireBadCard(body, card);
      body.querySelector('[data-share]').addEventListener('click', () => shareResult(res, nm));
      body.querySelector('[data-next]')?.addEventListener('click', () => act(conn, view, 'next', customArgs(Core().mergeSettings(pub.settings))));
      body.querySelector('[data-settings]')?.addEventListener('click', () => openRoomSettings(conn, view, players.length));
      body.querySelector('[data-invite]')?.addEventListener('click', () => Kit().inviteFriends(GAME, view.code, LABEL));
      body.querySelector('[data-leave]').addEventListener('click', async () => {
        if (isHost && pub.hub && window.PartyHub && (await PartyHub.backToHub(pub.hub))) return;
        await act(conn, view, isHost ? 'end' : 'leave');
        shell.close();
      });
      if (!view.celebrated || view.celebrated !== pub.roundNo) {
        view.celebrated = pub.roundNo;
        const iWon = (res.points[me] || 0) > 0;
        try {
          if (typeof gameFeedback === 'function') gameFeedback(iWon ? 'win' : 'select');
        } catch (e) {}
      }
    }
  }

  /** Built-in card behind a Room result (for "Bad card"); custom packs have none. */
  function roomCard(res) {
    if (!res || !res.majority) return null;
    const words = [res.majority, res.minority].filter(Boolean).map((w) => w.en);
    const packs = Core().packs.PACKS;
    const catId = res.category && res.category.id;
    const order = catId ? packs.filter((p) => p.id === catId).concat(packs.filter((p) => p.id !== catId)) : packs;
    for (const p of order) {
      const row = p.words.find((r) => words.indexOf(r[0]) >= 0 && (words.length < 2 || words.indexOf(r[2]) >= 0));
      if (row) return { game: GAME, key: Core().wordKey(p.id, row), label: row[0] };
    }
    return null;
  }

  /** Built-in card behind a Room result (for "Bad card"); custom packs have none. */
  function roomCard(res) {
    if (!res || !res.majority) return null;
    const words = [res.majority, res.minority].filter(Boolean).map((w) => w.en);
    const packs = Core().packs.PACKS;
    const catId = res.category && res.category.id;
    const order = catId ? packs.filter((p) => p.id === catId).concat(packs.filter((p) => p.id !== catId)) : packs;
    for (const p of order) {
      const row = p.words.find((r) => words.indexOf(r[0]) >= 0 && (words.length < 2 || words.indexOf(r[2]) >= 0));
      if (row) return { game: GAME, key: Core().wordKey(p.id, row), label: row[0] };
    }
    return null;
  }

  function voteBreakdownHtml(st, nm) {
    const t = st.lastTally;
    if (!t || !t.votes || !Object.keys(t.votes).length) return '';
    const rows = Object.keys(t.votes)
      .map((v) => `<div class="im-tally-row"><span>${esc(nm(v))}</span><span class="im-arrow" aria-hidden="true">→</span><strong>${esc(nm(t.votes[v]))}</strong></div>`)
      .join('');
    return `<details class="im-breakdown"><summary>${t.revote ? tHtml('games.imposter.revote_breakdown') : tHtml('games.imposter.vote_breakdown')}</summary><div class="im-tally">${rows}</div></details>`;
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
  const launchImposter = window.PartyKit ? PartyKit.withGameData(GAME, openImposter) : openImposter;

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'imposter',
      name: LABEL,
      desc: t('games.imposter.everyone_knows_the_word_except_the'),
      icon: '🕵️',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 20,
      meta: {
        kit: t('games.imposter.party_kit_js_pass_play_room'),
        dealing: 'party_room → server-lib/party-deal.js; roles never in shared state',
        packs: 'data/imposter-packs.js',
      },
      launch: launchImposter,
    });
  }

  window.openImposterGame = launchImposter;
})();
