/**
 * Most Likely To? — Dangal party game (G3, H0) on the Party Kit. One game, three modes:
 *   Most Likely To  — everyone votes for the friend who fits the prompt; the room crowns a winner.
 *   Would You Rather — everyone secretly picks a side and predicts the majority.
 *   Never Have I Ever — everyone answers “I have” / “Never”; optional five-finger elimination.
 * Pass & Play: one phone, offline, no sign-in — secret pass-around vote (or "count of 3, point").
 * Room: each player on their own phone — votes go to party_room and stay server-side until reveal;
 *       anonymous reveal publishes tallies only.
 * Virtual points only; never chips.
 */
(function () {
  'use strict';

  const GAME = 'mostlikely';
  const LABEL = t('dangal.identity.mostlikely.label');
  const PASS_KEY = 'chaupaal_mostlikely_settings';
  const ROOM_KEY = 'chaupaal_mostlikely_room_settings';
  const NAMES_KEY = 'chaupaal_mostlikely_names';
  const BOTH_KEY = 'chaupaal_mostlikely_bilingual';

  const Core = () => window.MostLikelyCore;
  const Kit = () => window.PartyKit;
  const esc = (s) => (window.PartyKit ? PartyKit.esc(s) : String(s == null ? '' : s));

  /** Session-only custom prompts: Pass & Play list, and the host's list per room code. Never saved. */
  let passCustoms = [];
  const roomCustoms = {};

  function lang() {
    const raw = typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof normalizeLang === 'function' ? normalizeLang(raw) : raw;
  }

  function both() {
    try {
      return localStorage.getItem(BOTH_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function toggleBoth() {
    try {
      localStorage.setItem(BOTH_KEY, both() ? '0' : '1');
    } catch (e) {}
  }

  function isHi() {
    return String(lang()).indexOf('hi') === 0;
  }

  function hiUi(k) {
    const P = window.MOSTLIKELY_PACKS;
    return P && typeof P.uiText === 'function' ? P.uiText('hi', k) : '';
  }

  function loadSettings(where) {
    const key = where === 'room' ? ROOM_KEY : PASS_KEY;
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {}
    // Rooms default to anonymous %; Pass & Play defaults to names (everyone is in the same room anyway).
    const src = Object.assign({}, raw || (where === 'room' ? { reveal: 'anon' } : {}));
    // Global prompts by default; India add-ons follow the locale until the host picks packs.
    if (!src.region) src.region = Kit().contentPrefs().region;
    src.customOnly = false;
    return Core().mergeSettings(src, lang());
  }

  /** Host's AI / saved pack per room code (sent with start; the server keeps it for the session). */
  const roomPacks = {};

  /** "Bad card" target for a built-in prompt (custom prompts have none). */
  function promptCard(prompt) {
    const key = prompt && prompt.key;
    return key && !prompt.custom && String(key).indexOf('c:') !== 0 ? { game: GAME, key, label: prompt.en || '' } : null;
  }

  /** Make-a-pack items → session customs for one mode (kindness-checked by cleanCustom). */
  function packToCustoms(items, mode) {
    const out = [];
    (items || []).forEach((it) => {
      const r = Core().cleanCustom(it, mode);
      if (r.ok) out.push({ mode, prompt: r.prompt, used: false });
    });
    return out;
  }

  function saveSettings(where, s) {
    try {
      localStorage.setItem(where === 'room' ? ROOM_KEY : PASS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadNames() {
    const night = Kit().passNightNames && Kit().passNightNames(2, Core().MAX_PLAYERS);
    if (night) return night;
    try {
      const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');
      if (Array.isArray(raw) && raw.length >= 2) return raw.slice(0, 16);
    } catch (e) {}
    return [Kit().myName() || '', '', ''];
  }

  function saveNames(names) {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 16)));
    } catch (e) {}
  }

  function packLabel(p) {
    return window.PartyCore ? PartyCore.bilingualLabel(p, lang(), false) : p.en;
  }

  function modeLine(s, where) {
    const C = Core();
    return [
      C.MODE_LABELS[s.mode],
      s.rounds ? t('games.mostlikely.n_rounds', { count: s.rounds }) : t('games.mostlikely.endless'),
      C.activePacks(s, lang()).length + ' packs',
      s.reveal === 'anon' ? t('games.mostlikely.reveal_anon') : t('games.mostlikely.reveal_names'),
      s.mode === 'nhie' ? (C.fingersOn(s) ? t('games.mostlikely.five_fingers') : t('games.mostlikely.casual')) : '',
      where === 'pass' && s.voting === 'quick' ? t('games.mostlikely.count_of_3') : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function joinNames(ids, nm) {
    const names = ids.map(nm);
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  }

  function mltShort(prompt) {
    if (!prompt) return '';
    const _t = String(prompt.en || '').replace(/\?+$/, '');
    return prompt.custom && /^(who|which)\b/i.test(_t) ? _t : t('games.mostlikely.most_likely_to_value', { value: _t });
  }

  // ---------------- how-to ----------------

  function howToCardHtml() {
    return `<details class="pk-howto">
      <summary>${tHtml('games.mostlikely.how_to_play_20_seconds')}</summary>
      <ol>
        <li><strong>${tHtml('games.mostlikely.most_likely_to_2')}</strong> ${tHtml('games.mostlikely.read_the_prompt_who_s_most')}</li>
        <li>${tHtml('games.mostlikely.the_tally_is_revealed_and_the')}</li>
        <li><strong>${tHtml('games.mostlikely.would_you_rather_2')}</strong> ${tHtml('games.mostlikely.secretly_pick_a_or_b_and')}</li>
        <li>${tHtml('games.mostlikely.points_optional_1_if_you_voted')}</li>
        <li><strong>${tHtml('games.mostlikely.never_have_i_ever')}</strong> ${tHtml('games.mostlikely.nhie_howto_line')}</li>
      </ol>
      <div class="pk-howto-score">${tHtml('games.mostlikely.playful_never_mean_no_prompts_about')}</div>
    </details>`;
  }

  // ---------------- settings ----------------

  function openPackPicker(s, onSave) {
    const sel = new Set(s.packs || []);
    const P = Core().packs;
    Kit().openSheet({
      title: t('games.mostlikely.packs'),
      bodyHtml: `<div class="im-packs">${P.PACKS.map((p) => {
        const modes = [p.likely.length ? t('games.mostlikely.mode_mlt_short') : '', p.rather.length ? t('games.mostlikely.mode_wyr') : '', p.never.length ? t('games.mostlikely.mode_nhie') : ''].filter(Boolean).join(' + ');
        return `<label class="im-pack"><input type="checkbox" data-pack="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}>
          <span class="im-pack-icon" aria-hidden="true">${esc(p.icon)}</span>
          <span class="im-pack-name">${esc(packLabel(p))}${p.regional ? ' <em class="ml-regional">' + tHtml('games.mostlikely.regional') + '</em>' : ''}<span class="ml-pack-modes">${esc(modes)}</span></span>
          <span class="im-pack-count">${p.likely.length + p.rather.length + p.never.length}</span></label>`;
      }).join('')}</div>
      <div class="pk-field-help" data-pack-err></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          const ids = Array.from(sheet.querySelectorAll('[data-pack]:checked')).map((el) => el.dataset.pack);
          const usable = Core().packs.packsFor(s.mode).some((p) => ids.indexOf(p.id) >= 0);
          if (!ids.length || !usable) {
            sheet.querySelector('[data-pack-err]').textContent = t('games.mostlikely.pick_at_least_one_pack_for', { value: Core().MODE_LABELS[s.mode] });
            return;
          }
          close();
          onSave(ids);
        });
      },
    });
  }

  function customLabel(c) {
    if (c.mode === 'wyr') return c.prompt.a.en + ' / ' + c.prompt.b.en;
    if (c.mode === 'nhie') return t('games.mostlikely.never_have_i_ever_en', { en: c.prompt.en });
    return t('games.mostlikely.most_likely_to_en', { en: c.prompt.en });
  }

  const CUSTOM_ICON = { mlt: '👉', wyr: '🤔', nhie: '🙊' };

  /** Session-only custom prompts. Checked by the kindness filter; never sent anywhere to be stored. */
  function openCustoms(list, mode, onChange) {
    const K = Kit();
    K.openSheet({
      title: t('games.mostlikely.custom_prompts'),
      bodyHtml: `<div class="pk-field-help">${tHtml('games.mostlikely.only_for_this_session_never_saved')}</div>
        ${
          mode === 'wyr'
            ? `<input class="pk-input" data-a maxlength="80" placeholder="${tHtml('games.mostlikely.option_a')}" aria-label="${tHtml('games.mostlikely.option_a')}">
               <input class="pk-input ml-mt" data-b maxlength="80" placeholder="${tHtml('games.mostlikely.option_b')}" aria-label="${tHtml('games.mostlikely.option_b')}">`
            : mode === 'nhie'
              ? `<input class="pk-input" data-text maxlength="120" placeholder="${tHtml('games.mostlikely.never_have_i_ever_e_g')}" aria-label="${tHtml('games.mostlikely.never_have_i_ever_2')}">`
              : `<input class="pk-input" data-text maxlength="120" placeholder="${tHtml('games.mostlikely.most_likely_to_e_g_sing')}" aria-label="${tHtml('games.mostlikely.most_likely_to_3')}">`
        }
        <div class="pk-error" data-err></div>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-add>${tHtml('games.mostlikely.add_prompt')}</button>
        <div class="ml-custom-list" data-list></div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
      onMount(sheet, close) {
        const listEl = sheet.querySelector('[data-list]');
        const paint = () => {
          listEl.innerHTML = list.length
            ? list
                .map(
                  (c, i) => `<div class="ml-custom-row"><span class="ml-custom-mode">${CUSTOM_ICON[c.mode] || '👉'}</span><span class="ml-custom-text">${esc(customLabel(c))}</span>${
                    c.used ? '<span class="ml-custom-used">' + tHtml('games.mostlikely.played') + '</span>' : ''
                  }<button type="button" class="pk-player-remove" data-rm="${i}" aria-label="${tHtml('common.remove')}">✕</button></div>`
                )
                .join('')
            : '<div class="pk-hint">' + tHtml('games.mostlikely.no_custom_prompts_yet') + '</div>';
          listEl.querySelectorAll('[data-rm]').forEach((b) =>
            b.addEventListener('click', () => {
              list.splice(Number(b.dataset.rm), 1);
              paint();
              onChange && onChange();
            })
          );
        };
        paint();
        sheet.querySelector('[data-add]').addEventListener('click', () => {
          const err = sheet.querySelector('[data-err]');
          const input = mode === 'wyr' ? { a: sheet.querySelector('[data-a]').value, b: sheet.querySelector('[data-b]').value } : sheet.querySelector('[data-text]').value;
          const out = Core().cleanCustom(input, mode);
          if (!out.ok) {
            err.textContent = out.reason;
            return;
          }
          err.textContent = '';
          list.push({ mode, prompt: out.prompt, used: false });
          sheet.querySelectorAll('input').forEach((inp) => (inp.value = ''));
          paint();
          onChange && onChange();
        });
        sheet.querySelector('[data-save]').addEventListener('click', close);
      },
    });
  }

  function openSettings(settings, opts) {
    const s = Object.assign({}, settings, { packs: (settings.packs || []).slice() });
    const K = Kit();
    const C = Core();
    const room = opts.context === 'room';
    const seg = (name, value, a, b) => K.segHtml(name, value, [[true, a], [false, b]]);
    K.openSheet({
      title: t('games.mostlikely.game_settings'),
      bodyHtml: `
        <div class="pk-field">
          <div class="pk-field-label">${tHtml('games.mostlikely.rules.variant.rounds.label')}</div>
          ${K.segHtml('rounds', s.rounds, C.ROUND_OPTIONS.map((r) => [r, r ? String(r) : t('games.mostlikely.endless')]))}
        </div>
        <button type="button" class="im-pack-row" data-packs>${tHtml('games.mostlikely.packs_2')} <strong data-packs-n>${C.activePacks(s, lang()).length}</strong> <span class="im-chev">›</span></button>
        <details class="pk-advanced">
          <summary>${tHtml('games.mostlikely.advanced')}</summary>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.mostlikely.points')}</div>
            ${seg('scoring', s.scoring, t('games.mostlikely.on'), t('games.mostlikely.off'))}
            <div class="pk-field-help">${tHtml('games.mostlikely.1_for_voting_with_the_room')}</div>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.mostlikely.reveal')}</div>
            ${K.segHtml('reveal', s.reveal, /* i18n-copy */ [['names', t('games.mostlikely.show_names')], ['anon', t('games.mostlikely.anonymous')]])}
            <div class="pk-field-help">${tHtml('games.mostlikely.anonymous_shows_only_the_totals_never')}</div>
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.mostlikely.vote_for_yourself_most_likely')}</div>
            ${seg('selfVote', s.selfVote, t('games.mostlikely.allowed'), t('games.mostlikely.not_allowed'))}
          </div>
          <div class="pk-field">
            <div class="pk-field-label">${tHtml('games.mostlikely.defend_yourself_most_likely')}</div>
            ${seg('defence', s.defence, t('games.mostlikely.on'), t('games.mostlikely.off'))}
            <div class="pk-field-help">${tHtml('games.mostlikely.15_seconds_for_the_crowned_player')}</div>
          </div>
          ${
            room
              ? ''
              : `<div class="pk-field">
            <div class="pk-field-label">${tHtml('games.mostlikely.voting')}</div>
            ${K.segHtml('voting', s.voting, /* i18n-copy */ [['secret', t('games.mostlikely.secret_pass_around')], ['quick', t('games.mostlikely.count_of_3_point')]])}
            <div class="pk-field-help">${tHtml('games.mostlikely.quick_everyone_points_or_raises_hands')}</div>
          </div>`
          }
          ${
            opts.customs
              ? `<button type="button" class="im-pack-row" data-customs>${tHtml('games.mostlikely.custom_prompts_2')} <strong data-customs-n>${opts.customs.length}</strong> <span class="im-chev">›</span></button>`
              : ''
          }
          ${
            opts.onPack && (K.aiOn() || K.savedPacks(GAME).length)
              ? `<button type="button" class="pk-row-btn" data-make>${K.aiOn() ? tHtml('games.mostlikely.make_a_pack_about') : tHtml('games.mostlikely.your_saved_packs')}<span class="pk-chev" aria-hidden="true">›</span></button>`
              : ''
          }
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${tHtml('common.done')}</button>`,
      onMount(sheet, close) {
        K.wireSegs(sheet, s);
        sheet.querySelector('[data-packs]').addEventListener('click', () =>
          openPackPicker(s, (ids) => {
            s.packs = ids;
            sheet.querySelector('[data-packs-n]').textContent = String(C.activePacks(s, lang()).length);
          })
        );
        sheet.querySelector('[data-customs]')?.addEventListener('click', () =>
          openCustoms(opts.customs, s.mode, () => {
            const n = sheet.querySelector('[data-customs-n]');
            if (n) n.textContent = String(opts.customs.length);
          })
        );
        sheet.querySelector('[data-make]')?.addEventListener('click', () => {
          close();
          K.openPackSheet({
            game: GAME,
            kind: 'prompts',
            mode: s.mode,
            min: 4,
            onUse: (p) => opts.onPack(C.mergeSettings(s, lang()), p),
          });
        });
        sheet.querySelector('[data-save]').addEventListener('click', () => {
          close();
          opts.onSave(C.mergeSettings(s, lang()));
        });
      },
    });
  }

  // ---------------- shared views ----------------

  /** Hindi readers can add the English line; everyone else just reads English. */
  function langBtn() {
    return isHi() && hiUi('toggle') ? `<button type="button" class="ml-lang" data-lang-toggle aria-pressed="${both()}" aria-label="${tHtml('games.mostlikely.also_show_english')}">${esc(hiUi('toggle'))}</button>` : '';
  }

  function wireLang(body, rerender) {
    body.querySelectorAll('[data-lang-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        toggleBoth();
        rerender();
      })
    );
  }

  function optionHtml(side, opt) {
    const l = Core().optionLines(opt, lang(), both());
    return `<span class="ml-opt-tag">${side.toUpperCase()}</span><span class="ml-opt-text">${esc(l.primary)}${l.secondary ? `<span class="ml-opt-sub">${esc(l.secondary)}</span>` : ''}</span>`;
  }

  /** Statement in the reader's language: i18n key `games.mostlikely.nhie.<pack>.n<i>`, English source as the fallback. */
  function nhieText(prompt) {
    const en = String((prompt && prompt.en) || '').replace(/[.!]+$/, '');
    if (!prompt || prompt.custom || !prompt.key || typeof t !== 'function') return en;
    return t('games.mostlikely.nhie.' + String(prompt.key).replace(':', '.').replace(/-/g, '_'), en);
  }

  function nhieLine(prompt) {
    const lead = typeof t === 'function' ? t('nhie_lead', 'Never have I ever…') : t('games.mostlikely.never_have_i_ever_3');
    return lead + ' ' + nhieText(prompt);
  }

  function promptHtml(prompt, mode) {
    const C = Core();
    const tag = prompt && prompt.custom ? '<span class="ml-tag">' + tHtml('games.mostlikely.custom') + '</span>' : '';
    if (mode === 'nhie') {
      return `<div class="ml-prompt ml-prompt--nhie">${tag}
        <div class="ml-prompt-lead">${esc(typeof t === 'function' ? t('nhie_lead', 'Never have I ever…') : t('games.mostlikely.never_have_i_ever_3'))}</div>
        <div class="ml-prompt-q">${esc(nhieText(prompt))}</div>
      </div>`;
    }
    if (mode === 'wyr') {
      return `<div class="ml-prompt ml-prompt--wyr">${langBtn()}${tag}
        <div class="ml-prompt-q">${tHtml('games.mostlikely.would_you_rather')}</div>
        <div class="ml-options">
          <div class="ml-opt ml-opt--a">${optionHtml('a', prompt.a)}</div>
          <div class="ml-or">${tHtml('common.or')}</div>
          <div class="ml-opt ml-opt--b">${optionHtml('b', prompt.b)}</div>
        </div>
      </div>`;
    }
    const l = C.promptLines(prompt, 'mlt', lang(), both());
    return `<div class="ml-prompt">${langBtn()}${tag}
      <div class="ml-prompt-q">${esc(l.primary)}</div>
      ${l.secondary ? `<div class="ml-prompt-sub">${esc(l.secondary)}</div>` : ''}
    </div>`;
  }

  /** Voting controls. draft = { target } or { pick, guess }. */
  function voteControlsHtml(mode) {
    if (mode === 'nhie') {
      return `<div class="ml-choose">
        <div class="ml-choices ml-choices--nhie"><button type="button" class="ml-choice ml-choice--have" data-answer="have">${tHtml('games.mostlikely.i_have_2')}</button><button type="button" class="ml-choice ml-choice--never" data-answer="never">${tHtml('games.mostlikely.never_2')}</button></div>
      </div>`;
    }
    if (mode === 'wyr') {
      return `<div class="ml-choose">
        <div class="pk-section">${tHtml('games.mostlikely.your_pick')}</div>
        <div class="ml-choices"><button type="button" class="ml-choice" data-pick="a">A</button><button type="button" class="ml-choice" data-pick="b">B</button></div>
        <div class="pk-section">${tHtml('games.mostlikely.which_side_will_most_people_pick')}</div>
        <div class="ml-choices ml-choices--guess"><button type="button" class="ml-choice ml-choice--guess" data-guess="a">${tHtml('games.mostlikely.most_pick_a')}</button><button type="button" class="ml-choice ml-choice--guess" data-guess="b">${tHtml('games.mostlikely.most_pick_b')}</button></div>
      </div>`;
    }
    return '<div class="pk-section">' + tHtml('games.mostlikely.tap_your_vote') + '</div><div data-picker></div>';
  }

  function wireVoteControls(root, mode, opts) {
    const draft = opts.draft;
    if (mode === 'nhie') {
      const paint = () => {
        root.querySelectorAll('[data-answer]').forEach((b) => {
          b.classList.toggle('is-on', b.dataset.answer === draft.answer);
          b.setAttribute('aria-pressed', String(b.dataset.answer === draft.answer));
        });
        opts.onChange(!!draft.answer);
      };
      root.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', () => ((draft.answer = b.dataset.answer), paint())));
      paint();
      return;
    }
    if (mode === 'wyr') {
      const paint = () => {
        root.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('is-on', b.dataset.pick === draft.pick));
        root.querySelectorAll('[data-guess]').forEach((b) => b.classList.toggle('is-on', b.dataset.guess === draft.guess));
        opts.onChange(!!(draft.pick && draft.guess));
      };
      root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => ((draft.pick = b.dataset.pick), paint())));
      root.querySelectorAll('[data-guess]').forEach((b) => b.addEventListener('click', () => ((draft.guess = b.dataset.guess), paint())));
      paint();
      return;
    }
    Kit().mountPicker(root.querySelector('[data-picker]'), {
      players: opts.players,
      exclude: opts.exclude || [],
      selected: draft.target ? [draft.target] : [],
      onPick: (ids) => {
        draft.target = ids[0];
        opts.onChange(!!draft.target);
      },
    });
    opts.onChange(!!draft.target);
  }

  function revealMltHtml(res, nm, prompt) {
    const C = Core();
    const ids = Object.keys(res.tally).sort((a, b) => res.tally[b] - res.tally[a] || nm(a).localeCompare(nm(b)));
    const max = Math.max(1, res.topVotes);
    const crowned = res.top.length
      ? `<div class="ml-crown"><span class="ml-crown-icon" aria-hidden="true">👑</span><span class="ml-crown-name">${esc(joinNames(res.top, nm))}</span>
         <span class="ml-badge">${esc(res.top.length > 1 ? t('games.mostlikely.shared_crown') : C.badgeFor(prompt))}</span>
         <span class="ml-crown-sub">${tHtml('games.mostlikely.top_of_votes', { n: res.topVotes, count: res.total })}</span></div>`
      : '<div class="ml-crown ml-crown--none">' + tHtml('games.mostlikely.no_votes_this_round') + '</div>';
    const bars = ids
      .filter((id) => res.tally[id] > 0 || !res.anon)
      .map(
        (id) => `<div class="ml-bar-row${res.top.indexOf(id) >= 0 ? ' is-top' : ''}">
          <span class="ml-bar-name">${res.top.indexOf(id) >= 0 ? '👑 ' : ''}${esc(nm(id))}</span>
          <span class="ml-bar"><span class="ml-bar-fill" style="--w:${Math.round((res.tally[id] / max) * 100)}%"></span></span>
          <span class="ml-bar-count">${res.tally[id]}</span>
        </div>`
      )
      .join('');
    const who =
      res.votes && Object.keys(res.votes).length
        ? `<details class="ml-who"><summary>${tHtml('games.mostlikely.who_voted_for_whom')}</summary>${Object.keys(res.votes)
            .map((v) => `<div class="ml-who-row">${esc(nm(v))} → ${esc(nm(res.votes[v]))}</div>`)
            .join('')}</details>`
        : res.anon
          ? '<div class="pk-field-help">' + tHtml('games.mostlikely.anonymous_only_the_totals_are_shown') + '</div>'
          : '';
    return `<div class="ml-reveal">${crowned}<div class="ml-bars">${bars}</div>${who}</div>`;
  }

  function revealWyrHtml(res, nm, prompt) {
    const C = Core();
    const total = res.total || 0;
    const pa = total ? Math.round((res.counts.a / total) * 100) : 50;
    const pb = total ? 100 - pa : 50;
    const side = (s) => C.optionLines(prompt[s], lang(), false).primary;
    const names = (s) =>
      res.picks
        ? Object.keys(res.picks)
            .filter((id) => res.picks[id] === s)
            .map((id) => `<span class="ml-side-name">${esc(nm(id))}</span>`)
            .join('') || '<span class="ml-side-name is-empty">' + tHtml('games.mostlikely.nobody') + '</span>'
        : '';
    const headline = res.majority ? t('games.mostlikely.most_would_rather_side', { side: side(res.majority) }) : total ? t('games.mostlikely.split_room') : t('games.mostlikely.no_votes_this_round');
    const predict = res.majority
      ? t('games.mostlikely.predictedright_of_total_guessed_the_majori', { predictedRight: res.predictedRight, total, value: Object.keys(res.points || {}).length ? t('games.mostlikely.1_each') : '' })
      : total
        ? t('games.mostlikely.no_majority_nobody_scores_the_prediction')
        : '';
    return `<div class="ml-reveal ml-reveal--wyr">
      <div class="ml-crown"><span class="ml-crown-icon" aria-hidden="true">${res.majority ? '🤔' : '⚖️'}</span><span class="ml-crown-name">${esc(headline)}</span><span class="ml-crown-sub">${esc(predict)}</span></div>
      <div class="ml-split" role="img" aria-label="${tHtml('games.mostlikely.split_aria', { a: pa, b: pb })}">
        <span class="ml-split-a" style="--w:${pa}%"><strong>A</strong> ${pa}%</span>
        <span class="ml-split-b" style="--w:${pb}%"><strong>B</strong> ${pb}%</span>
      </div>
      <div class="ml-sides">
        <div class="ml-side ml-side--a"><div class="ml-side-label">A · ${res.counts.a}</div><div class="ml-side-opt">${esc(side('a'))}</div>${names('a')}</div>
        <div class="ml-side ml-side--b"><div class="ml-side-label">B · ${res.counts.b}</div><div class="ml-side-opt">${esc(side('b'))}</div>${names('b')}</div>
      </div>
      ${res.anon ? '<div class="pk-field-help">' + tHtml('games.mostlikely.anonymous_only_the_split_is_shown') + '</div>' : ''}
    </div>`;
  }

  function nhieHeadline(res) {
    const total = res.total || 0;
    if (!total) return t('games.mostlikely.no_answers_this_round');
    if (!res.counts.have) return t('games.mostlikely.nobody_has');
    if (res.counts.have === total) return t('games.mostlikely.everyone_has');
    return res.counts.have + ' of ' + total + ' have';
  }

  function revealNhieHtml(res, nm) {
    const total = res.total || 0;
    const pct = total ? Math.round((res.counts.have / total) * 100) : 50;
    const lost = res.lost || [];
    const names = (list) =>
      list.map((id) => `<span class="ml-side-name">${esc(nm(id))}${lost.indexOf(id) >= 0 ? ' <em class="ml-lost">−1 ✋</em>' : ''}</span>`).join('') ||
      '<span class="ml-side-name is-empty">' + tHtml('games.mostlikely.nobody') + '</span>';
    return `<div class="ml-reveal ml-reveal--nhie">
      <div class="ml-crown"><span class="ml-crown-icon" aria-hidden="true">${!total ? '🤷' : res.counts.have ? '🙋' : '😇'}</span><span class="ml-crown-name">${esc(nhieHeadline(res))}</span></div>
      <div class="ml-split" role="img" aria-label="${tHtml('games.mostlikely.nhie_aria', { have: res.counts.have, never: res.counts.never })}">
        <span class="ml-split-a" style="--w:${pct}%"><strong>🙋</strong> ${res.counts.have}</span>
        <span class="ml-split-b" style="--w:${100 - pct}%"><strong>😇</strong> ${res.counts.never}</span>
      </div>
      ${
        res.anon
          ? '<div class="pk-field-help">' + tHtml('games.mostlikely.anonymous_only_the_count_is_shown') + '</div>'
          : `<div class="ml-sides">
        <div class="ml-side ml-side--a"><div class="ml-side-label">${tHtml('games.mostlikely.i_have_have', { have: res.counts.have })}</div>${names(res.haves || [])}</div>
        <div class="ml-side ml-side--b"><div class="ml-side-label">${tHtml('games.mostlikely.never_never', { never: res.counts.never })}</div>${names(res.nevers || [])}</div>
      </div>`
      }
    </div>`;
  }

  /** Five-finger hands (Never Have I Ever). Empty when no finger round has been played. */
  function fingersHtml(standings, nm) {
    if (!standings || !standings.rows.length) return '';
    const F = Core().FINGERS;
    const rows = standings.rows
      .slice()
      .sort((a, b) => b.fingers - a.fingers || nm(a.id).localeCompare(nm(b.id)))
      .map(
        (r) => `<div class="ml-finger-row${r.fingers ? '' : ' is-out'}">
          <span class="ml-finger-name">${esc(nm(r.id))}</span>
          <span class="ml-finger-hand" role="img" aria-label="${tHtml('games.mostlikely.fingers_left_of', { n: r.fingers, total: F })}">${Array.from({ length: F }, (_, i) => `<i class="ml-finger${i < r.fingers ? ' is-up' : ''}"></i>`).join('')}</span>
          <span class="ml-finger-n">${r.fingers ? r.fingers : 'out'}</span>
        </div>`
      )
      .join('');
    return `<div class="pk-section">${tHtml('games.mostlikely.fingers_left')}</div><div class="ml-fingers">${rows}</div>`;
  }

  function revealHtml(round, nm) {
    if (round.mode === 'nhie') return revealNhieHtml(round.result, nm);
    return round.mode === 'wyr' ? revealWyrHtml(round.result, nm, round.prompt) : revealMltHtml(round.result, nm, round.prompt);
  }

  /** Bars grow in after paint. */
  function animateReveal(body) {
    requestAnimationFrame(() => requestAnimationFrame(() => body.querySelectorAll('.ml-reveal').forEach((el) => el.classList.add('is-in'))));
  }

  function revealAnnouncement(round, nm) {
    const res = round.result;
    if (round.mode === 'nhie') return { icon: !res.total ? '🤷' : res.counts.have ? '🙋' : '😇', title: nhieHeadline(res), sub: nhieLine(round.prompt) };
    if (round.mode === 'wyr') {
      const side = res.majority ? Core().optionLines(round.prompt[res.majority], lang(), false).primary : '';
      return res.majority ? { icon: '🤔', title: t('games.mostlikely.most_would_rather'), sub: side } : { icon: '⚖️', title: res.total ? t('games.mostlikely.split_room') : t('games.mostlikely.no_votes') };
    }
    return res.top.length
      ? { icon: '👑', title: joinNames(res.top, nm) + '!', sub: res.top.length > 1 ? t('games.mostlikely.shared_crown') : Core().badgeFor(round.prompt) }
      : { icon: '🤷', title: t('games.mostlikely.no_votes_this_round') };
  }

  function defenceHtml(round, nm) {
    return `<div class="ml-defence">
      <div class="ml-defence-title">${tHtml('games.mostlikely.defend_yourself')}</div>
      ${isHi() && hiUi('defence') ? `<div class="ml-defence-hi">${esc(hiUi('defence'))}</div>` : ''}
      <div class="pk-sub">${tHtml('games.mostlikely.make_your_case', { names: joinNames(round.result.top, nm), count: 15 })}</div>
      <div class="pk-timer" data-timer></div>
    </div>`;
  }

  function verdictHtml(session, players, nm) {
    const C = Core();
    const rows = C.verdict(session, players.map((p) => p.id))
      .sort((a, b) => b.crowns - a.crowns || nm(a.id).localeCompare(nm(b.id)))
      .map(
        (v) => `<div class="ml-verdict-row${v.best ? '' : ' is-clean'}">
          <span class="ml-verdict-name">${esc(nm(v.id))}${v.crowns ? ` <em>👑×${v.crowns}</em>` : ''}</span>
          <span class="ml-verdict-text">${v.best ? esc(mltShort(v.best)) + ` <em>(${v.best.votes}/${v.best.total})</em>` : tHtml('games.mostlikely.clean_record')}</span>
        </div>`
      )
      .join('');
    return `<div class="ml-final-block"><div class="pk-section">${tHtml('games.mostlikely.room_s_verdict')}</div><div class="ml-verdict">${rows}</div></div>`;
  }

  function highlightsHtml(session, players, nm, scores, scoring) {
    const C = Core();
    const h = C.highlights(session, players.map((p) => p.id), scoring ? scores : {});
    const pair = (x) => (x && x.a && x.b ? `${esc(x.a.en)} vs ${esc(x.b.en)} (${x.counts.a}–${x.counts.b})` : '');
    const rows = [
      h.inSync.ids.length ? /* i18n-copy */ ['🤝', t('games.mostlikely.most_in_sync'), t('games.mostlikely.joinnames_with_the_majority_n', { joinNames: joinNames(h.inSync.ids, nm), n: h.inSync.n })] : null,
      h.rebel.ids.length ? /* i18n-copy */ ['😎', t('games.mostlikely.rebel_of_the_room'), t('games.mostlikely.joinnames_in_the_minority_n', { joinNames: joinNames(h.rebel.ids, nm), n: h.rebel.n })] : null,
      scoring && h.predictor.ids.length ? /* i18n-copy */ ['🔮', t('games.mostlikely.best_predictor'), joinNames(h.predictor.ids, nm) + ' · ' + h.predictor.n + ' pts'] : null,
      h.closest ? /* i18n-copy */ ['⚖️', t('games.mostlikely.closest_call'), pair(h.closest)] : null,
      h.unanimous ? /* i18n-copy */ ['📣', t('games.mostlikely.most_agreed'), pair(h.unanimous)] : null,
    ].filter(Boolean);
    if (!rows.length) return '';
    return `<div class="ml-final-block"><div class="pk-section">${tHtml('games.mostlikely.highlights')}</div><div class="ml-highs">${rows
      .map((r) => `<div class="ml-high"><span class="ml-high-icon" aria-hidden="true">${r[0]}</span><span class="ml-high-label">${r[1]}</span><span class="ml-high-text">${r[2]}</span></div>`)
      .join('')}</div></div>`;
  }

  function nhieFinalHtml(session, players, nm) {
    const C = Core();
    const ids = players.map((p) => p.id);
    const st = C.nhieStandings(session, ids);
    const h = C.nhieHighlights(session, ids);
    const quote = (x) => (x ? '“' + nhieText(x) + '” (' + x.counts.have + '/' + x.total + ')' : '');
    const rows = [
      st && st.winners.length ? ['🖐', t('games.mostlikely.last_hands_standing', { count: st.winners.length }), joinNames(st.winners, nm)] : null,
      h.adventurous.ids.length ? /* i18n-copy */ ['🧭', t('games.mostlikely.most_adventurous'), joinNames(h.adventurous.ids, nm) + ' · “I have” ' + h.adventurous.n + '×'] : null,
      h.innocent.ids.length ? /* i18n-copy */ ['😇', t('games.mostlikely.most_innocent'), joinNames(h.innocent.ids, nm) + ' · “Never” ' + h.innocent.n + '×'] : null,
      h.common ? /* i18n-copy */ ['🙋', t('games.mostlikely.most_of_us_have'), quote(h.common)] : null,
      h.rarest ? /* i18n-copy */ ['🦄', t('games.mostlikely.rarest'), quote(h.rarest)] : null,
    ].filter(Boolean);
    return `${
      rows.length
        ? `<div class="ml-final-block"><div class="pk-section">${tHtml('games.mostlikely.highlights')}</div><div class="ml-highs">${rows
            .map((r) => `<div class="ml-high"><span class="ml-high-icon" aria-hidden="true">${r[0]}</span><span class="ml-high-label">${r[1]}</span><span class="ml-high-text">${esc(r[2])}</span></div>`)
            .join('')}</div></div>`
        : ''
    }${fingersHtml(st, nm)}`;
  }

  function finalHtml(session, players, nm, scores, s) {
    const hasMlt = (session.history || []).some((h) => h.mode === 'mlt');
    const hasWyr = (session.history || []).some((h) => h.mode === 'wyr');
    const hasNhie = (session.history || []).some((h) => h.mode === 'nhie');
    return `<div class="ml-final">
      <div class="pk-result-glyph" aria-hidden="true">${hasMlt ? '👑' : hasNhie && !hasWyr ? '🙊' : '🤔'}</div>
      <div class="pk-result-title">${tHtml('games.mostlikely.rounds_played', { count: session.rounds })}</div>
      ${hasMlt ? verdictHtml(session, players, nm) : ''}
      ${hasWyr ? highlightsHtml(session, players, nm, scores, s.scoring) : ''}
      ${hasNhie ? nhieFinalHtml(session, players, nm) : ''}
      ${s.scoring && (hasMlt || hasWyr) ? `<div class="pk-section">${tHtml('games.mostlikely.points')}</div>${Kit().scoreboardHtml(players, scores)}` : ''}
    </div>`;
  }

  function nhieShareLine(session, players, nm) {
    const C = Core();
    const ids = players.map((p) => p.id);
    const st = C.nhieStandings(session, ids);
    const h = C.nhieHighlights(session, ids);
    const parts = [];
    if (st && st.winners.length) parts.push(t('games.mostlikely.last_hand_standing_joinnames', { joinNames: joinNames(st.winners, nm) }));
    if (h.adventurous.ids.length) parts.push(t('games.mostlikely.most_adventurous_joinnames', { joinNames: joinNames(h.adventurous.ids, nm) }));
    if (h.innocent.ids.length) parts.push(t('games.mostlikely.most_innocent_joinnames', { joinNames: joinNames(h.innocent.ids, nm) }));
    if (!parts.length && h.common) parts.push(t('games.mostlikely.have_of_total_of_us_have', { have: h.common.counts.have, total: h.common.total, nhieText: nhieText(h.common) }));
    return (parts.join(' · ') || t('games.mostlikely.we_played_nhie')) + ' 🙊';
  }

  function finalShareLine(session, players, nm, scores) {
    const C = Core();
    const lastMode = ((session.history || []).slice(-1)[0] || {}).mode;
    if (lastMode === 'nhie') return nhieShareLine(session, players, nm);
    const hasMlt = (session.history || []).some((h) => h.mode === 'mlt');
    if (hasMlt) {
      const v = C.verdict(session, players.map((p) => p.id))
        .filter((x) => x.best)
        .sort((a, b) => b.crowns - a.crowns || b.best.share - a.best.share)[0];
      if (v) return t('games.mostlikely.room_s_verdict_nm_mltshort', { nm: nm(v.id), mltShort: mltShort(v.best) });
    }
    const h = C.highlights(session, players.map((p) => p.id), scores);
    const parts = [];
    if (h.inSync.ids.length) parts.push(t('games.mostlikely.most_in_sync_joinnames', { joinNames: joinNames(h.inSync.ids, nm) }));
    if (h.rebel.ids.length) parts.push(t('games.mostlikely.rebel_of_the_room_joinnames', { joinNames: joinNames(h.rebel.ids, nm) }));
    if (!parts.length && h.closest) parts.push(t('games.mostlikely.closest_call_en_vs_en2', { en: h.closest.a.en, en2: h.closest.b.en }));
    return (parts.join(' · ') || t('games.mostlikely.we_played_wyr')) + ' 🤔';
  }

  function roundShareLine(round, nm) {
    const res = round.result;
    if (round.mode === 'nhie') return nhieLine(round.prompt) + ' — ' + (res.total ? t('games.mostlikely.have_of_total_of_us_have_2', { have: res.counts.have, total: res.total }) : t('games.mostlikely.nobody_answered'));
    if (round.mode === 'wyr') {
      const total = res.total || 0;
      if (!total) return t('games.mostlikely.would_you_rather_en_or_en2', { en: round.prompt.a.en, en2: round.prompt.b.en });
      const side = res.majority || 'a';
      const pct = Math.round((res.counts[side] / total) * 100);
      return t('games.mostlikely.pct_of_us_would_rather_en', { pct, en: round.prompt[side].en });
    }
    return res.top.length ? joinNames(res.top, nm) + ' — ' + mltShort(round.prompt) + ' 👑' : t('games.mostlikely.mltshort_the_room_couldn_t_decide', { mltShort: mltShort(round.prompt) });
  }

  function share(line) {
    Kit().shareLine(GAME, LABEL, line);
  }

  // ---------------- entry ----------------

  function open(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) {
      if (typeof showToast === 'function') showToast(t('games.mostlikely.label_is_still_loading_try_again', { LABEL }));
      return;
    }
    if ((c.source === 'chat_group' || c.isGroup) && c.chat) {
      startRoom({ chat: c.chat });
      return;
    }
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: t('games.mostlikely.party'), confirmLeave: () => false });
    if (c.mode === 'pass') renderPassSetup(shell);
    else renderHome(shell);
  }

  function renderHome(shell) {
    const body = shell.render(
      Kit().homeHtml({
        game: GAME,
        icon: '👉',
        title: t('games.mostlikely.most_likely_to'),
        sub: t('games.mostlikely.2_16_players_vote_on_your'),
        howToHtml: howToCardHtml(),
      })
    );
    body.querySelector('[data-mode="pass"]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-mode="room"]').addEventListener('click', () => Kit().closeThen(shell, () => startRoom({})));
    body.querySelector('[data-mode="join"]').addEventListener('click', () =>
      Kit().closeThen(shell, () => Kit().openJoinSheet((code) => openRoom(code, { join: true })))
    );
  }

  function modeCardsHtml(mode) {
    const card = (id, icon, title, sub, extra) =>
      `<button type="button" class="ml-mode${extra || ''}${mode === id ? ' is-on' : ''}" data-mode-pick="${id}" aria-pressed="${mode === id}">
        <span class="ml-mode-icon" aria-hidden="true">${icon}</span><span class="ml-mode-title">${title}</span><span class="ml-mode-sub">${sub}</span></button>`;
    return `<div class="ml-modes">${card('mlt', '👉', t('games.mostlikely.rules.rules.1.h'), t('games.mostlikely.vote_for_the_friend_who_fits'))}${card('wyr', '🤔', t('games.mostlikely.rules.rules.2.h'), t('games.mostlikely.pick_a_side_guess_the_room'))}${card(
      'nhie',
      '🙊',
      t('games.mostlikely.rules.rules.3.h'),
      t('games.mostlikely.i_have_or_never_five_fingers'),
      ' ml-mode--wide'
    )}</div>`;
  }

  // ======================= PASS & PLAY =======================

  function renderPassSetup(shell) {
    const settings = loadSettings('pass');
    let names = loadNames();
    const body = shell.render(`<div class="pk-page">
      <div class="pk-setup-head">
        <div class="pk-title">${tHtml('games.mostlikely.pick_a_game')}</div>
        <button type="button" class="pk-icon-btn" data-settings aria-label="${tHtml('games.mostlikely.game_settings')}">⚙︎</button>
      </div>
      <div data-modes></div>
      <div class="pk-section">${tHtml('games.mostlikely.who_s_playing')}</div>
      <div data-editor></div>
      <div class="pk-meta" data-meta></div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start>${tHtml('games.mostlikely.start')}</button>
    </div>`);
    shell.setBack(() => renderHome(shell));
    let editor = null;
    const rawNames = () => Array.from(body.querySelectorAll('[data-pk-name]')).map((i) => i.value);
    const paintMeta = () => {
      const meta = body.querySelector('[data-meta]');
      if (meta) meta.textContent = modeLine(settings, 'pass');
    };
    const mountEditor = () => {
      editor = Kit().mountPlayerEditor(body.querySelector('[data-editor]'), {
        names,
        min: Core().minPlayers(settings),
        max: Core().MAX_PLAYERS,
      });
    };
    const paintModes = () => {
      const el = body.querySelector('[data-modes]');
      el.innerHTML = modeCardsHtml(settings.mode);
      el.querySelectorAll('[data-mode-pick]').forEach((b) =>
        b.addEventListener('click', () => {
          names = rawNames();
          settings.mode = b.dataset.modePick;
          saveSettings('pass', settings);
          paintModes();
          mountEditor();
          paintMeta();
        })
      );
    };
    paintModes();
    mountEditor();
    paintMeta();
    body.querySelector('[data-settings]').addEventListener('click', () =>
      openSettings(settings, {
        context: 'pass',
        customs: passCustoms,
        onSave: (s) => {
          Object.assign(settings, s);
          saveSettings('pass', settings);
          paintMeta();
        },
        onPack: (s, p) => {
          const add = packToCustoms(p.items, s.mode);
          passCustoms.push.apply(passCustoms, add);
          Object.assign(settings, s, { customOnly: add.length >= 4 });
          saveSettings('pass', settings);
          paintMeta();
        },
      })
    );
    body.querySelector('[data-start]').addEventListener('click', () => {
      const list = editor.list();
      saveNames(list);
      const session = {
        players: list.map((name, i) => ({ id: 'p' + i, name })),
        scores: {},
        roundNo: 0,
        settings: Core().mergeSettings(settings, lang()),
        deck: null,
        customs: passCustoms,
        stats: Core().newSession(),
      };
      session.players.forEach((p) => (session.scores[p.id] = 0));
      Kit().refreshRetired(GAME);
      shell.guard = true;
      startPassRound(shell, session);
    });
  }

  function nameOf(session, id) {
    const p = session.players.find((x) => x.id === id);
    return p ? p.name : t('common.someone');
  }

  function startPassRound(shell, session, skip) {
    const C = Core();
    const out = C.nextPrompt(session.deck, session.settings, lang(), Math.random, session.customs, Kit().retiredCached(GAME));
    session.deck = out.state;
    if (!skip) session.roundNo += 1;
    const key = out.prompt && out.prompt.key;
    if (key && key.indexOf('c:') === 0 && session.customs[Number(key.slice(2))]) session.customs[Number(key.slice(2))].used = true;
    const ids = session.players.map((p) => p.id);
    const roundIds = session.settings.mode === 'nhie' ? C.nhieRoundPlayers(session.stats, ids, session.settings) : ids;
    if (roundIds.length < C.minPlayers(session.settings)) return renderPassFinal(shell, session);
    session.round = {
      pub: C.createRound(roundIds, out.prompt, session.settings, session.roundNo),
      hidden: C.createHidden(),
      recorded: false,
    };
    const s = session.settings;
    shell.setSubtitle(C.MODE_LABELS[s.mode] + ' · Round ' + session.roundNo + (s.rounds ? ' of ' + s.rounds : ''));
    renderPassPrompt(shell, session);
  }

  function renderPassPrompt(shell, session) {
    const r = session.round.pub;
    const s = session.settings;
    const quick = s.voting === 'quick';
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">${tHtml('games.mostlikely.round_roundno_value', { roundNo: session.roundNo, value: s.rounds ? t('games.mostlikely.of_rounds', { rounds: s.rounds }) : '' })}</div>
      ${promptHtml(r.prompt, r.mode)}
      <div class="pk-sub">${
        quick
          ? r.mode === 'nhie'
            ? tHtml('games.mostlikely.on_three_hands_up_if_you')
            : r.mode === 'wyr'
              ? tHtml('games.mostlikely.on_three_everyone_raises_a_hand')
              : tHtml('games.mostlikely.on_three_everyone_points_at_a')
          : r.mode === 'nhie'
            ? tHtml('games.mostlikely.everyone_answers_in_secret_pass_the')
            : tHtml('games.mostlikely.everyone_votes_in_secret_pass_the')
      }</div>
      ${r.mode === 'nhie' && r.fingers ? passOutNote(session, r) : ''}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${quick ? '1… 2… 3!' : tHtml('games.mostlikely.start_secret_vote')}</button>
      <button type="button" class="pk-link" data-skip>${tHtml('games.mostlikely.skip_this_one')}</button>
    </div>`);
    wireLang(body, () => renderPassPrompt(shell, session));
    body.querySelector('[data-skip]').addEventListener('click', () => startPassRound(shell, session, true));
    body.querySelector('[data-go]').addEventListener('click', () => (quick ? renderPassQuick(shell, session) : renderPassVote(shell, session, 0)));
  }

  function passOutNote(session, r) {
    const out = session.players.filter((p) => r.players.indexOf(p.id) < 0).map((p) => p.name);
    return out.length ? `<div class="pk-field-help">${tHtml('games.mostlikely.out_of_fingers_value_they_watch', { value: out.join(', ') })}</div>` : '';
  }

  function renderPassVote(shell, session, index) {
    const r = session.round.pub;
    if (r.phase !== 'vote') return renderPassReveal(shell, session);
    const id = r.players[index];
    if (!id) {
      Core().applyAction(r, session.round.hidden, session.settings, { type: 'close' });
      return renderPassReveal(shell, session);
    }
    const draft = {};
    const players = session.players.map((p) => ({ id: p.id, name: p.name }));
    const body = shell.render(`<div class="pk-page">
      <div class="pk-progress">${tHtml('games.mostlikely.vote_value_of_playerscount', { value: index + 1, playersCount: r.players.length })}</div>
      <div data-vote></div>
    </div>`);
    Kit().mountPassVote(body.querySelector('[data-vote]'), {
      name: nameOf(session, id),
      bodyHtml: `<div class="ml-vote-face">${promptHtml(r.prompt, r.mode)}${voteControlsHtml(r.mode)}</div>`,
      doneLabel: index === r.players.length - 1 ? t('games.mostlikely.lock_vote_reveal') : t('games.mostlikely.lock_vote_pass'),
      onMount(face, setReady) {
        face.querySelectorAll('[data-lang-toggle]').forEach((b) => (b.hidden = true));
        wireVoteControls(face, r.mode, {
          draft,
          players,
          exclude: session.settings.selfVote ? [] : [id],
          onChange: setReady,
        });
      },
      onDone() {
        const action =
          r.mode === 'nhie'
            ? { type: 'vote', id, answer: draft.answer }
            : r.mode === 'wyr'
              ? { type: 'vote', id, pick: draft.pick, guess: draft.guess }
              : { type: 'vote', id, target: draft.target };
        Core().applyAction(r, session.round.hidden, session.settings, action);
        renderPassVote(shell, session, index + 1);
      },
    });
  }

  function renderPassQuick(shell, session) {
    const r = session.round.pub;
    const nm = (id) => nameOf(session, id);
    const counts = {};
    const picks = {};
    r.players.forEach((id) => (counts[id] = 0));
    const body = shell.render(`<div class="pk-page">
      ${promptHtml(r.prompt, r.mode)}
      <div class="pk-section">${r.mode === 'nhie' ? tHtml('games.mostlikely.tap_everyone_whose_hand_went_up') : r.mode === 'wyr' ? tHtml('games.mostlikely.tap_a_or_b_for_each') : tHtml('games.mostlikely.how_many_pointed_at_each_player')}</div>
      <div class="ml-quick">${r.players
        .map((id) =>
          r.mode === 'nhie'
            ? `<div class="ml-quick-row"><span class="ml-quick-name">${esc(nm(id))}</span><button type="button" class="ml-choice ml-choice--sm" data-hand="${esc(id)}" aria-pressed="false">${tHtml('games.mostlikely.i_have_2')}</button></div>`
            : r.mode === 'wyr'
            ? `<div class="ml-quick-row"><span class="ml-quick-name">${esc(nm(id))}</span><span class="ml-quick-ab"><button type="button" class="ml-choice ml-choice--sm" data-q="${esc(id)}" data-side="a">A</button><button type="button" class="ml-choice ml-choice--sm" data-q="${esc(id)}" data-side="b">B</button></span></div>`
            : `<div class="ml-quick-row"><span class="ml-quick-name">${esc(nm(id))}</span><span class="ml-stepper"><button type="button" data-dec="${esc(id)}" aria-label="${tHtml('games.mostlikely.one_less')}">−</button><strong data-n="${esc(id)}">0</strong><button type="button" data-inc="${esc(id)}" aria-label="${tHtml('games.mostlikely.one_more')}">+</button></span></div>`
        )
        .join('')}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-reveal ${r.mode === 'nhie' ? '' : 'disabled'}>${tHtml('games.mostlikely.reveal')}</button>
    </div>`);
    wireLang(body, () => renderPassQuick(shell, session));
    const btn = body.querySelector('[data-reveal]');
    const hands = new Set();
    body.querySelectorAll('[data-hand]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.hand;
        if (hands.has(id)) hands.delete(id);
        else hands.add(id);
        b.classList.toggle('is-on', hands.has(id));
        b.setAttribute('aria-pressed', String(hands.has(id)));
      })
    );
    const total = () => Object.keys(counts).reduce((n, id) => n + counts[id], 0);
    body.querySelectorAll('[data-inc],[data-dec]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.inc || b.dataset.dec;
        counts[id] = Math.max(0, Math.min(r.players.length, counts[id] + (b.dataset.inc ? 1 : -1)));
        body.querySelector(`[data-n="${CSS.escape(id)}"]`).textContent = String(counts[id]);
        btn.disabled = total() === 0;
      })
    );
    body.querySelectorAll('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        picks[b.dataset.q] = b.dataset.side;
        body.querySelectorAll(`[data-q="${CSS.escape(b.dataset.q)}"]`).forEach((x) => x.classList.toggle('is-on', x.dataset.side === b.dataset.side));
        btn.disabled = !Object.keys(picks).length;
      })
    );
    btn.addEventListener('click', () => {
      const action = r.mode === 'nhie' ? { type: 'quick', haves: Array.from(hands) } : r.mode === 'wyr' ? { type: 'quick', picks } : { type: 'quick', tally: counts };
      Core().applyAction(r, session.round.hidden, session.settings, action);
      renderPassReveal(shell, session);
    });
  }

  function recordPass(session) {
    const round = session.round;
    if (round.recorded || !round.pub.result) return;
    round.recorded = true;
    Core().recordRound(session.stats, round.pub);
    const pts = round.pub.result.points || {};
    Object.keys(pts).forEach((id) => (session.scores[id] = (session.scores[id] || 0) + pts[id]));
  }

  async function renderPassReveal(shell, session, skipAnim) {
    const r = session.round.pub;
    const nm = (id) => nameOf(session, id);
    recordPass(session);
    if (!skipAnim) {
      if (r.result.top && r.result.top.length) Kit().ding();
      await Kit().bigReveal(Object.assign({ host: shell.el }, revealAnnouncement(r, nm)));
    }
    if (r.phase === 'defence') {
      const body = shell.render(`<div class="pk-page">
        ${promptHtml(r.prompt, r.mode)}
        ${revealHtml(r, nm)}
        ${defenceHtml(r, nm)}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-done>${tHtml('games.mostlikely.case_closed')}</button>
      </div>`);
      animateReveal(body);
      wireLang(body, () => renderPassReveal(shell, session, true));
      const finish = () => {
        if (clock) clock.stop();
        Core().applyAction(r, session.round.hidden, session.settings, { type: 'endDefence' });
        renderPassResult(shell, session);
      };
      const clock = Kit().countdown(body.querySelector('[data-timer]'), {
        seconds: Core().DEFENCE_SEC,
        onDone: () => {
          Kit().buzz();
          if (session.round.pub.phase === 'defence' && body.isConnected) finish();
        },
      });
      body.querySelector('[data-done]').addEventListener('click', finish);
      return;
    }
    renderPassResult(shell, session);
  }

  function renderPassResult(shell, session) {
    const r = session.round.pub;
    const s = session.settings;
    const nm = (id) => nameOf(session, id);
    const last = Core().isOver(s, session.roundNo, session.stats);
    const body = shell.render(`<div class="pk-page">
      ${promptHtml(r.prompt, r.mode)}
      ${revealHtml(r, nm)}
      ${roundBoardHtml(r, s, session.stats, session.players, session.scores, nm)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${last ? tHtml('games.mostlikely.see_the_verdict') : tHtml('games.mostlikely.next_round')}</button>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
        ${last ? '' : '<button type="button" class="pk-btn pk-btn--ghost" data-end>' + tHtml('games.mostlikely.end_game') + '</button>'}
      </div>
      ${Kit().badCardHtml(promptCard(r.prompt))}
    </div>`);
    if (promptCard(r.prompt)) Kit().wireBadCard(body, promptCard(r.prompt));
    animateReveal(body);
    wireLang(body, () => renderPassResult(shell, session));
    body.querySelector('[data-share]').addEventListener('click', () => share(roundShareLine(r, nm)));
    body.querySelector('[data-end]')?.addEventListener('click', () => renderPassFinal(shell, session));
    body.querySelector('[data-next]').addEventListener('click', () => (last ? renderPassFinal(shell, session) : startPassRound(shell, session)));
  }

  /** Under a round result: fingers for Never Have I Ever, points for the other modes. */
  function roundBoardHtml(r, s, stats, players, scores, nm) {
    if (r.mode === 'nhie') return r.fingers ? fingersHtml(Core().nhieStandings(stats, players.map((p) => p.id)), nm) : '';
    return s.scoring ? `<div class="pk-section">${tHtml('games.mostlikely.points')}</div>${Kit().scoreboardHtml(players, scores, r.result.points)}` : '';
  }

  function renderPassFinal(shell, session) {
    const nm = (id) => nameOf(session, id);
    shell.guard = false;
    shell.setSubtitle(t('games.mostlikely.final'));
    Kit().reportPass(GAME, { players: session.players, scores: session.scores });
    const body = shell.render(`<div class="pk-page">
      ${finalHtml(session.stats, session.players, nm, session.scores, session.settings)}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${tHtml('games.mostlikely.play_again')}</button>
      ${Kit().passHubButtonHtml()}
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('common.share')}</button>
        <button type="button" class="pk-btn pk-btn--ghost" data-setup>${tHtml('games.mostlikely.players_settings')}</button>
      </div>
    </div>`);
    try {
      if (typeof gameFeedback === 'function') gameFeedback('win');
    } catch (e) {}
    Kit().wirePassHub(body, shell);
    body.querySelector('[data-share]').addEventListener('click', () => share(finalShareLine(session.stats, session.players, nm, session.scores)));
    body.querySelector('[data-setup]').addEventListener('click', () => renderPassSetup(shell));
    body.querySelector('[data-again]').addEventListener('click', () => {
      session.players.forEach((p) => (session.scores[p.id] = 0));
      session.roundNo = 0;
      session.stats = Core().newSession();
      startPassRound(shell, session);
    });
  }

  // ======================= ROOM =======================

  function customsFor(code) {
    if (!roomCustoms[code]) roomCustoms[code] = [];
    return roomCustoms[code];
  }

  function settingsOf(ctrl) {
    return Core().mergeSettings(ctrl.view.pub.settings, lang());
  }

  function startRoom(o) {
    Kit().createRoom({
      game: GAME,
      label: LABEL,
      settings: loadSettings('room'),
      chat: o && o.chat,
      open: openRoom,
    });
  }

  /**
   * The host's phone decides when to slot in one of its custom prompts and sends only that one
   * prompt with start/next. Spread so every custom gets played before the game ends.
   */
  function hostCustomArgs(ctrl, op) {
    if (!ctrl.isHost()) return null;
    const s = settingsOf(ctrl);
    const list = customsFor(ctrl.view.code);
    const unused = list.filter((c) => !c.used && c.mode === s.mode);
    if (!unused.length) return null;
    const pub = ctrl.view.pub;
    const fresh = op === 'start' && (pub.status === 'lobby' || pub.over);
    const played = fresh ? 0 : Number(pub.roundNo) || 0;
    const left = s.rounds ? Math.max(1, s.rounds - played) : Infinity;
    const chance = Math.max(0.34, unused.length / left);
    if (Math.random() >= chance) return null;
    const c = unused[0];
    const custom = c.mode === 'wyr' ? { a: c.prompt.a.en, b: c.prompt.b.en } : c.prompt.en;
    return { args: { custom }, onDone: (ok) => ok && (c.used = true) };
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
      hydrate: (st) => {
        Core().hydrateRound(st);
        st.session = Core().hydrateSession(st.session);
        return st;
      },
      lobbySummary: (ctrl) => modeLine(settingsOf(ctrl), 'room'),
      canStart: (ctrl, players) => {
        const min = Core().minPlayers(settingsOf(ctrl));
        return players.length < min ? { ok: false, label: t('games.mostlikely.need_value_more_to_start', { value: min - players.length }) } : { ok: true, label: t('games.mostlikely.start') };
      },
      openSettings: (ctrl) =>
        openSettings(settingsOf(ctrl), {
          context: 'room',
          customs: customsFor(code),
          onSave: (next) => {
            saveSettings('room', next);
            ctrl.act('settings', { settings: next });
          },
          onPack: (next, p) => {
            roomPacks[code] = { mode: next.mode, items: p.items };
            ctrl.act('settings', { settings: Object.assign({}, next, { customOnly: true }) });
          },
        }),
      onLobbyMount: (ctrl, body) => {
        if (!ctrl.isHost()) return;
        const row = body.querySelector('[data-settings]');
        if (!row) return;
        const pick = document.createElement('div');
        pick.innerHTML = modeCardsHtml(settingsOf(ctrl).mode);
        row.before(pick);
        pick.querySelectorAll('[data-mode-pick]').forEach((b) =>
          b.addEventListener('click', () => {
            const next = Object.assign({}, settingsOf(ctrl), { mode: b.dataset.modePick });
            saveSettings('room', next);
            ctrl.act('settings', { settings: next });
          })
        );
      },
      startArgs: (ctrl, op) => {
        const a = hostCustomArgs(ctrl, op) || { args: {} };
        const pack = roomPacks[code];
        if (ctrl.isHost() && pack && op === 'start' && pack.mode === settingsOf(ctrl).mode) {
          a.args = Object.assign({}, a.args, { customPack: { mode: pack.mode, prompts: pack.items } });
        }
        return Object.keys(a.args).length ? a : null;
      },
      onState: onRoomState,
      renderPhase: renderRoomPhase,
    });
  }

  function onRoomState(ctrl, st, prev) {
    if (!prev || prev.n !== st.n || prev.phase !== 'vote' || st.phase === 'vote' || !st.result) return;
    if (st.result.top && st.result.top.length) Kit().ding();
    Kit().bigReveal(Object.assign({ host: ctrl.shell.el }, revealAnnouncement(st, ctrl.name)));
  }

  function myVoteLine(st, secret, nm) {
    if (!secret) return '';
    if (st.mode === 'nhie') return tHtml('games.mostlikely.you_answered_html', { answer: secret.answer === 'have' ? t('games.mostlikely.i_have') : t('games.mostlikely.never') });
    if (st.mode === 'wyr') return tHtml('games.mostlikely.you_picked_guessed_html', { pick: secret.pick === 'a' ? 'A' : 'B', guess: secret.guess === 'a' ? 'A' : 'B' });
    return tHtml('games.mostlikely.you_voted_html', { name: typeof bidi === 'function' ? bidi(nm(secret.target)) : nm(secret.target) });
  }

  function renderRoomPhase(ctrl, st) {
    const K = Kit();
    const me = ctrl.uid;
    const pub = ctrl.view.pub;
    const nm = ctrl.name;
    const s = settingsOf(ctrl);
    const view = ctrl.view;
    const secret = view.secret && Number(view.secret.roundNo) === Number(pub.roundNo) ? view.secret : null;
    const inRound = st.players.indexOf(me) >= 0;
    ctrl.shell.setSubtitle((s.rounds ? t('games.mostlikely.room_round_of', { code: view.code, roundNo: pub.roundNo, rounds: s.rounds }) : t('games.mostlikely.room_round', { code: view.code, roundNo: pub.roundNo })));
    const rerender = () => renderRoomPhase(ctrl, st);
    const timed = st.phase === 'vote' || st.phase === 'defence';
    const top = `${ctrl.hostBar(timed)}${ctrl.pausedNote()}`;

    if (st.phase === 'vote') {
      if (!view.mlDraft || view.mlDraft.n !== st.n) view.mlDraft = { n: st.n };
      const choosing = inRound && (!secret || view.mlChange === st.n);
      if (choosing) {
        const body = ctrl.render(`<div class="pk-page">${top}
          <div class="pk-progress">${tHtml('dangal.voted_of', { n: st.voted.length, total: st.players.length })} · <span class="pk-timer pk-timer--inline" data-timer></span></div>
          ${promptHtml(st.prompt, st.mode)}
          ${voteControlsHtml(st.mode)}
          <div class="pk-error" data-err></div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-lock disabled>${tHtml('games.mostlikely.lock_my_vote')}</button>
          <div class="pk-field-help">${tHtml('games.mostlikely.your_vote_stays_secret_until_everyone')}</div>
        </div>`);
        ctrl.wire(body);
        wireLang(body, rerender);
        const lock = body.querySelector('[data-lock]');
        wireVoteControls(body, st.mode, {
          draft: view.mlDraft,
          players: st.players.map((id) => ({ id, name: nm(id) })),
          exclude: s.selfVote ? [] : [me],
          onChange: (ok) => (lock.disabled = !ok),
        });
        lock.addEventListener('click', async () => {
          const d = view.mlDraft;
          const args = st.mode === 'nhie' ? { answer: d.answer } : st.mode === 'wyr' ? { pick: d.pick, guess: d.guess } : { target: d.target };
          const out = await ctrl.act('vote', args, body.querySelector('[data-err]'));
          if (out) view.mlChange = null;
        });
        return;
      }
      const body = ctrl.render(`<div class="pk-page">${top}
        ${promptHtml(st.prompt, st.mode)}
        <div class="ml-voted">
          ${
            inRound
              ? `<div class="ml-voted-mine">${tHtml('games.mostlikely.vote_locked_myvoteline', { myVoteLine: myVoteLine(st, secret, nm) })} <span class="ml-private">${tHtml('games.mostlikely.only_you_can_see_this')}</span></div>`
              : st.mode === 'nhie' && st.fingers && st.session && st.session.fingers && me in st.session.fingers && Core().fingersLeft(st.session, me) === 0
                ? '<div class="pk-sub">' + tHtml('games.mostlikely.you_re_out_of_fingers_watch') + '</div>'
                : '<div class="pk-sub">' + tHtml('games.mostlikely.you_ll_vote_from_the_next') + '</div>'
          }
          <div class="pk-sub">${tHtml('dangal.voted_of', { n: st.voted.length, total: st.players.length })}</div>
          <div class="ml-voted-list">${st.players.map((id) => `<span class="ml-voted-chip${st.voted.indexOf(id) >= 0 ? ' is-in' : ''}">${esc(nm(id))}</span>`).join('')}</div>
          <div class="pk-timer" data-timer></div>
        </div>
        ${inRound ? '<button type="button" class="pk-link" data-change>' + tHtml('games.mostlikely.change_my_vote') + '</button>' : ''}
        ${ctrl.isHost() ? `<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-reveal ${st.voted.length ? '' : 'disabled'}>${tHtml('games.mostlikely.reveal_now')}</button>` : ''}
      </div>`);
      ctrl.wire(body);
      wireLang(body, rerender);
      body.querySelector('[data-change]')?.addEventListener('click', () => {
        view.mlChange = st.n;
        rerender();
      });
      body.querySelector('[data-reveal]')?.addEventListener('click', () => ctrl.act('revealNow'));
      return;
    }

    if (st.phase === 'defence' && st.result) {
      const canSkip = ctrl.isHost() || st.result.top.indexOf(me) >= 0;
      const body = ctrl.render(`<div class="pk-page">${top}
        ${promptHtml(st.prompt, st.mode)}
        ${revealHtml(st, nm)}
        ${defenceHtml(st, nm)}
        ${canSkip ? '<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-done>' + tHtml('games.mostlikely.case_closed') + '</button>' : ''}
      </div>`);
      ctrl.wire(body);
      wireLang(body, rerender);
      animateReveal(body);
      body.querySelector('[data-done]')?.addEventListener('click', () => ctrl.act('endDefence'));
      return;
    }

    if (st.phase === 'result' && st.result) {
      const players = ctrl.players().map((p) => ({ id: p.id, name: p.name }));
      const over = !!pub.over;
      const body = ctrl.render(`<div class="pk-page">
        ${promptHtml(st.prompt, st.mode)}
        ${revealHtml(st, nm)}
        ${
          over ? finalHtml(st.session, players, nm, pub.scores, s) : roundBoardHtml(st, s, st.session, players, pub.scores, nm)
        }
        ${K.roomResultActions(ctrl, {
          nextLabel: over ? t('games.mostlikely.play_again') : t('games.mostlikely.next_round'),
          waitLabel: over ? t('games.mostlikely.waiting_for_the_host_to_start') : t('games.mostlikely.waiting_for_the_host_to_start_2'),
          card: promptCard(st.prompt),
        })}
        ${!over && ctrl.isHost() ? '<button type="button" class="pk-link" data-finish>' + tHtml('games.mostlikely.end_game_see_the_verdict') + '</button>' : ''}
      </div>`);
      wireLang(body, rerender);
      animateReveal(body);
      K.wireRoomResultActions(ctrl, body, {
        nextOp: over ? 'start' : 'next',
        onShare: () => share(over ? finalShareLine(st.session, players, nm, pub.scores) : roundShareLine(st, nm)),
        card: promptCard(st.prompt),
      });
      body.querySelector('[data-finish]')?.addEventListener('click', () => ctrl.act('finish'));
      if (over && view.celebrated !== pub.roundNo) {
        view.celebrated = pub.roundNo;
        try {
          if (typeof gameFeedback === 'function') gameFeedback('win');
        } catch (e) {}
      }
    }
  }

  // ---------------- registration ----------------

  if (window.PartyKit) PartyKit.registerPartyGame(GAME, { label: LABEL, openRoom });
  const launch = window.PartyKit ? PartyKit.withGameData(GAME, open) : open;

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'mostlikely',
      name: LABEL,
      desc: t('games.mostlikely.most_likely_to_would_you_rather'),
      icon: '👉',
      gameType: 'multiplayer',
      genre: 'party',
      ratingKey: null,
      dangal: true,
      chat1v1: false,
      chatGroup: true,
      selfChat: false,
      order: 23,
      meta: {
        kit: t('games.mostlikely.party_kit_js_pass_play_room'),
        modes: t('games.mostlikely.most_likely_to_would_you_rather_2'),
        voting: 'party_room → server-lib/party-deal.js; votes stay server-side until reveal; anonymous = tallies only',
      },
      launch,
    });
  }

  window.openMostLikelyGame = launch;
})();
