/**
 * Dangal Assist UI (P16) — the light-AI surfaces, all deterministic first (DangalAssist), with an
 * optional AI upgrade through `dangal_ai` that the server validates and the phone re-checks:
 *   · Rules sheet: "Ask about the rules" box, game settings (sound / vibration / tips / reduce
 *     motion) and the Licences sheet
 *   · post-game tip card (after the result, never mid-game)
 *   · Kakuro / Shabd Five hint explanations
 *   · "What should we play?" suggestion sheet (Manch) + Party Hub suggestion line
 * Prefs (device): dangal_sound_off · dangal_haptics_off · dangal_tips_off · dangal_reduce_motion
 */
(function () {
  'use strict';

  const A = () => window.DangalAssist;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PREF = { sound: 'dangal_sound_off', haptics: 'dangal_haptics_off', tips: 'dangal_tips_off', motion: 'dangal_reduce_motion' };

  function getPref(key) {
    try {
      return localStorage.getItem(PREF[key]) === '1';
    } catch (e) {
      return false;
    }
  }
  function setPref(key, on) {
    try {
      localStorage.setItem(PREF[key], on ? '1' : '0');
    } catch (e) {}
    applyPrefs();
  }
  function applyPrefs() {
    try {
      if (window.Sound && typeof Sound.setEnabled === 'function') Sound.setEnabled(!getPref('sound'));
    } catch (e) {}
    try {
      document.documentElement.classList.toggle('dangal-reduce-motion', getPref('motion'));
    } catch (e) {}
  }

  function aiOn() {
    try {
      return typeof isAiFeaturesEnabledSync === 'function' && !!isAiFeaturesEnabledSync();
    } catch (e) {
      return false;
    }
  }
  function signedIn() {
    return typeof currentUser !== 'undefined' && !!(currentUser && currentUser.uid);
  }
  /** One `dangal_ai` call → { data, source } or null (never throws, never shows a raw error). */
  async function aiCall(hook, input) {
    if (!aiOn() || !signedIn() || typeof apiFetch !== 'function') return null;
    try {
      const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action: 'dangal_ai', hook, input } });
      if (!res || !res.ok || !res.data) return null;
      return res.data;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- rules sheet: ask + settings + licences

  /** Extra markup for the shared Rules sheet (dangal-rules.js sheetHtml). */
  function rulesExtrasHtml(id, variants) {
    const v = variants ? esc(JSON.stringify(variants)) : '';
    const toggle = (key, label, on) => `<label class="dangal-rules__toggle"><input type="checkbox" data-dangal-pref="${key}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
    return (
      `<form class="dangal-rules__ask" data-rules-ask="${esc(id)}" data-variants="${v}" autocomplete="off">` +
      `<label class="dangal-rules__label" for="dangalRulesQ">${tHtml('dangal.ask_about_the_rules')}</label>` +
      `<div class="dangal-rules__askrow"><input id="dangalRulesQ" class="dangal-rules__q" name="q" maxlength="200" placeholder="${tHtml('dangal.e_g_what_happens_if_time')}" enterkeyhint="send">` +
      `<button type="submit" class="dangal-rules__askbtn">${tHtml('dangal.ask')}</button></div>` +
      `<div class="dangal-rules__answer" data-rules-answer aria-live="polite"></div></form>` +
      `<details class="dangal-rules__settings"><summary>${tHtml('dangal.game_settings')}</summary>` +
      toggle('sound', 'Sound', !getPref('sound')) +
      toggle('haptics', 'Vibration', !getPref('haptics')) +
      toggle('tips', 'Post-game tips', !getPref('tips')) +
      toggle('motion', 'Reduce motion', getPref('motion')) +
      `<button type="button" class="dangal-rules__link" data-dangal-licences>${tHtml('dangal.licences')}</button></details>`
    );
  }

  function answerHtml(a, label) {
    if (!a) return '';
    const sections = a.sections && a.sections.length ? a.sections : a.section ? [a.section] : [];
    const src = sections.length ? `<div class="dangal-rules__cite">${tHtml('dangal.from_value_value2', { value: sections.map(esc).join(' · '), value2: label ? ' · ' + esc(label) : '' })}</div>` : label ? `<div class="dangal-rules__cite">${esc(label)}</div>` : '';
    const sug = a.notCovered && a.suggest && a.suggest.length
      ? `<div class="dangal-rules__sug">${tHtml('dangal.try_value', { value: { html: a.suggest.map((s) => `<button type="button" class="dangal-rules__chip" data-rules-suggest="${esc(s)}">${esc(s)}</button>`).join('') } })}</div>`
      : '';
    return `<p class="dangal-rules__a">${esc(a.answer)}</p>${src}${sug}`;
  }

  async function ask(form, question) {
    const id = form.dataset.rulesAsk;
    const out = form.querySelector('[data-rules-answer]');
    let variants = null;
    try {
      variants = form.dataset.variants ? JSON.parse(form.dataset.variants) : null;
    } catch (e) {}
    const q = String(question || '').trim();
    if (!q || !A()) return;
    const det = A().answerRules(id, q, variants);
    out.innerHTML = answerHtml(det, tHtml('dangal.rulebook'));
    const ai = await aiCall('rulesQA', { gameId: id, question: q, variants });
    if (!ai || !ai.data || (ai.source !== 'ai' && ai.source !== 'cache') || !out.isConnected) return;
    const d = ai.data;
    if (!d.covered) {
      if (!det.notCovered) return; // our rulebook found something — keep it
      out.innerHTML = answerHtml(Object.assign({}, det, { answer: A().NOT_COVERED }), '');
      return;
    }
    out.innerHTML = answerHtml({ answer: d.answer, sections: d.sections || [] }, t('dangal.ai_answer_from_these_rules'));
  }

  function openLicences() {
    const html = `<div class="dangal-licences">
      <h4>${tHtml('dangal.game_engines_and_content')}</h4>
      <p><strong>${tHtml('common.chess')}</strong> ${tHtml('dangal.the_engine_bots_review_and_rules')}</p>
      <p><strong>Kakuro</strong> ${tHtml('dangal.puzzles_are_generated_and_checked_by')} <strong>Shabd Five</strong> ${tHtml('dangal.uses_our_own_word_lists_quiz')}</p>
      <p><strong>${tHtml('dangal.classics.pref.sound')}</strong> ${tHtml('dangal.are_synthesised_on_your_device_web')}</p>
      <h4>${tHtml('dangal.services_and_fonts')}</h4>
      <p>${tHtml('dangal.firebase_javascript_sdk_apache_license_2')}</p>
      <h4>${tHtml('dangal.rules')}</h4>
      <p>${tHtml('dangal.each_rules_page_says_which_laws')}</p>
    </div>`;
    if (typeof window.openHalfSheet === 'function') window.openHalfSheet({ id: 'dangalLicencesSheet', title: t('dangal.licences'), accent: 'dangal', snap: 'mid', bodyHtml: html });
  }

  // ---------------------------------------------------------------- post-game tip

  let lastTipAt = 0;
  /**
   * Show one short tip after a finished game (call from the result step). stats: numbers from the
   * match; ctx: { live, rated, stake, midGame }. Never mid-game.
   */
  function showPostGameTip(gameId, stats, ctx) {
    if (!A() || getPref('tips')) return null;
    if (!A().tipAllowed(gameId, ctx)) return null;
    const now = Date.now();
    if (now - lastTipAt < 30000) return null;
    lastTipAt = now;
    const s = Object.assign({}, stats || {});
    const tip = A().pickTip(gameId, s, Math.floor(now / 60000));
    if (!tip) return null;
    setTimeout(() => renderTip(gameId, s, tip), 900);
    return tip;
  }

  function renderTip(gameId, stats, tip) {
    const host = document.querySelector('.device') || document.body;
    document.querySelector('.dangal-tip-card')?.remove();
    const el = document.createElement('div');
    el.className = 'dangal-tip-card';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<span class="dangal-tip-card__icon" aria-hidden="true">💡</span><div class="dangal-tip-card__body"><div class="dangal-tip-card__label">${tHtml('dangal.tip')}</div><div class="dangal-tip-card__text" data-tip-text>${esc(tip.text)}</div><button type="button" class="dangal-tip-card__off" data-tip-off>${tHtml('dangal.turn_off_tips')}</button></div><button type="button" class="dangal-tip-card__close" aria-label="${tHtml('dangal.dismiss_tip')}" data-tip-close>×</button>`;
    host.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-tip-close]').addEventListener('click', close);
    el.querySelector('[data-tip-off]').addEventListener('click', () => {
      setPref('tips', true);
      close();
    });
    setTimeout(close, 14000);
    aiCall('coachExplain', { gameId: A().canonId(gameId), mode: 'tip', stats, baseTip: tip.text }).then((ai) => {
      if (!ai || !el.isConnected || (ai.source !== 'ai' && ai.source !== 'cache')) return;
      const text = ai.data && ai.data.text;
      if (!text || !A().numbersGrounded(text, stats)) return;
      const t = el.querySelector('[data-tip-text]');
      if (t) t.textContent = text;
    });
  }

  // ---------------------------------------------------------------- hints

  /** Plain-English explanation for a deterministic hint. Resolves to text (AI) or null (keep ours). */
  async function explainHint(gameId, facts, baseText) {
    const ai = await aiCall('coachExplain', { gameId, mode: 'hint', facts, baseText });
    if (!ai || (ai.source !== 'ai' && ai.source !== 'cache')) return null;
    const text = ai.data && ai.data.text;
    if (!text || text === baseText || !A().numbersGrounded(text, facts)) return null;
    return text;
  }

  // ---------------------------------------------------------------- suggestions

  function recent() {
    try {
      if (typeof getLastPlayedGame === 'function') {
        const g = getLastPlayedGame();
        if (g) return [typeof g === 'string' ? g : g.id || g.gameId].filter(Boolean);
      }
    } catch (e) {}
    return [];
  }
  function adultOk() {
    try {
      return typeof ageGateStatus === 'function' ? ageGateStatus() === 'ok' : false;
    } catch (e) {
      return false;
    }
  }

  /** Suggestions (deterministic; AI may only reorder them). */
  async function suggestions(ctx) {
    if (!A()) return [];
    const c = Object.assign({ recent: recent(), adult: adultOk(), limit: 5 }, ctx || {});
    const list = A().recommend(c);
    if (!list.length) return list;
    const ai = await aiCall('rerankGames', { candidates: list.map((x) => ({ id: x.id, reason: x.reason })), ctx: { players: c.players, where: c.where, minutes: c.minutes } });
    if (ai && (ai.source === 'ai' || ai.source === 'cache') && ai.data && Array.isArray(ai.data.order) && ai.data.order.length === list.length) {
      const byId = {};
      list.forEach((x) => (byId[x.id] = x));
      const re = ai.data.order.map((id) => byId[id]).filter(Boolean);
      if (re.length === list.length) return re;
    }
    return list;
  }

  function launchGame(id) {
    if (typeof handleDangalGameTap === 'function') return handleDangalGameTap(id);
    const g = typeof getGame === 'function' ? getGame(id) : null;
    if (g && typeof g.launch === 'function') g.launch({ source: 'suggest' });
  }

  function openSuggestSheet() {
    const state = { players: 2, where: 'together', minutes: 15 };
    const seg = (name, val, opts) =>
      `<div class="dangal-suggest__seg" role="radiogroup" aria-label="${esc(name)}">${opts
        .map(([v, l]) => `<button type="button" role="radio" aria-checked="${String(v) === String(val)}" class="${String(v) === String(val) ? 'is-on' : ''}" data-s="${name}" data-v="${v}">${esc(l)}</button>`)
        .join('')}</div>`;
    const body = () => `<div class="dangal-suggest">
        <div class="dangal-suggest__row"><span>${tHtml('dangal.players')}</span><div class="dangal-suggest__step"><button type="button" data-step="-1" aria-label="${tHtml('dangal.fewer_players')}">−</button><b data-players aria-live="polite">${state.players}</b><button type="button" data-step="1" aria-label="${tHtml('dangal.more_players')}">+</button></div></div>
        <div class="dangal-suggest__row"><span>${tHtml('dangal.where')}</span>${seg('where', state.where, /* i18n-copy */ [['together', t('dangal.same_room')], ['remote', t('dangal.separate_phones')]])}</div>
        <div class="dangal-suggest__row"><span>${tHtml('dangal.time')}</span>${seg('minutes', state.minutes, [[5, '5 min'], [15, '15 min'], [30, '30+ min']])}</div>
        <div class="dangal-suggest__list" data-list aria-live="polite"></div>
      </div>`;
    if (typeof window.openHalfSheet !== 'function') return;
    const handle = window.openHalfSheet({ id: 'dangalSuggestSheet', title: t('dangal.what_should_we_play'), accent: 'dangal', snap: 'mid', bodyHtml: body() });
    const root = (handle && handle.el) || document.getElementById('dangalSuggestSheet');
    if (!root) return;
    const paint = async () => {
      const list = await suggestions({ players: state.players, where: state.players === 1 ? 'either' : state.where, minutes: state.minutes });
      const box = root.querySelector('[data-list]');
      if (!box) return;
      box.innerHTML = list.length
        ? list
            .map(
              (g) => `<button type="button" class="dangal-suggest__game" data-suggest-game="${esc(g.id)}">${typeof gameMarkHtml === 'function' ? gameMarkHtml(g.id, { size: 28 }) : ''}<span><strong>${esc(g.name)}</strong><small>${esc(g.reason)}</small></span></button>`
            )
            .join('')
        : '<p class="dangal-suggest__empty">' + tHtml('dangal.no_game_fits_that_exactly_try') + '</p>';
    };
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || !root.contains(t)) return;
      if (t.dataset.step) {
        state.players = Math.max(1, Math.min(20, state.players + Number(t.dataset.step)));
        const p = root.querySelector('[data-players]');
        if (p) p.textContent = String(state.players);
        paint();
      } else if (t.dataset.s) {
        state[t.dataset.s] = t.dataset.s === 'minutes' ? Number(t.dataset.v) : t.dataset.v;
        t.parentNode.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('is-on', b === t);
          b.setAttribute('aria-checked', String(b === t));
        });
        paint();
      } else if (t.dataset.suggestGame) {
        if (handle && typeof handle.close === 'function') handle.close();
        launchGame(t.dataset.suggestGame);
      }
    });
    paint();
  }

  // ---------------------------------------------------------------- wiring

  document.addEventListener('submit', (e) => {
    const form = e.target && e.target.closest && e.target.closest('form[data-rules-ask]');
    if (!form) return;
    e.preventDefault();
    ask(form, (form.querySelector('[name="q"]') || {}).value);
  });
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    const sug = t.closest('[data-rules-suggest]');
    if (sug) {
      const form = sug.closest('form[data-rules-ask]');
      const input = form && form.querySelector('[name="q"]');
      if (input) input.value = sug.dataset.rulesSuggest;
      if (form) ask(form, sug.dataset.rulesSuggest);
      return;
    }
    if (t.closest('[data-dangal-licences]')) {
      e.preventDefault();
      openLicences();
      return;
    }
    if (t.closest('[data-suggest-open]')) {
      e.preventDefault();
      openSuggestSheet();
    }
  });
  document.addEventListener('change', (e) => {
    const box = e.target && e.target.closest && e.target.closest('[data-dangal-pref]');
    if (!box) return;
    const key = box.dataset.dangalPref;
    // Checkboxes read "on" for sound / vibration / tips, but the stored prefs are "off" flags.
    setPref(key, key === 'motion' ? box.checked : !box.checked);
  });
  applyPrefs();

  window.DangalAssistUI = {
    rulesExtrasHtml,
    ask,
    showPostGameTip,
    explainHint,
    suggestions,
    openSuggestSheet,
    openLicences,
    getPref,
    setPref,
    aiOn,
  };
})();
