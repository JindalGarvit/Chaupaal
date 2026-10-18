/**
 * Language + region pickers (Global L0).
 * Settings → Language: "App language" (searchable, current pinned, Suggested = device languages we
 * support) and "Languages I read" (multi-select; feeds + Translate target). Settings → Region: a
 * searchable country picker. Onboarding gets a small "Language: X · Change" chip.
 * Also shows the one-time notice when a saved language was retired.
 */
(function () {
  'use strict';

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tx = (key, fallback, vars) => (typeof t === 'function' ? t(key, vars || fallback) : fallback);
  const txv = (key, fallback, vars) => {
    if (typeof t !== 'function') return fallback;
    const v = t(key, vars || {});
    return v && v !== key ? v : fallback.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
  };
  const curLang = () => (typeof normalizeLang === 'function' ? normalizeLang(typeof currentLang !== 'undefined' ? currentLang : 'en') : 'en');
  const catalog = () => (typeof LANG_CATALOG !== 'undefined' ? LANG_CATALOG : [{ code: 'en', native: 'English', name: 'English' }]);
  const entry = (code) => catalog().find((l) => l.code === code) || catalog()[0];
  const fold = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  function langLabel(code) {
    const e = entry(code);
    return e.native === e.name ? e.native : `${e.native} · ${e.name}`;
  }

  function langRowHtml(l, { checked, multi } = {}) {
    const sub = l.native === l.name ? '' : `<span class="cp-lang-en">${esc(l.name)}</span>`;
    return `<button type="button" class="cp-lang-row${checked ? ' is-on' : ''}" data-code="${esc(l.code)}" role="${multi ? 'checkbox' : 'option'}" aria-${multi ? 'checked' : 'selected'}="${checked ? 'true' : 'false'}" data-search="${esc(fold(l.native + ' ' + l.name + ' ' + l.code))}">
      <span class="cp-lang-text"><span class="cp-lang-native" lang="${esc(l.html || l.code)}">${esc(l.native)}</span>${sub}</span>
      <span class="cp-lang-check" aria-hidden="true">${checked ? '✓' : ''}</span>
    </button>`;
  }

  function groupHtml(label, rows) {
    if (!rows.length) return '';
    return `<div class="cp-lang-group" data-group><div class="cp-lang-group-label">${esc(label)}</div>${rows.join('')}</div>`;
  }

  /** Filter rows by the search box; groups collapse when empty; an empty result says so. */
  function wireSearch(root) {
    const input = root.querySelector('[data-lang-search]');
    const empty = root.querySelector('[data-lang-empty]');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = fold(input.value.trim());
      let shown = 0;
      root.querySelectorAll('[data-group]').forEach((g) => {
        let any = 0;
        g.querySelectorAll('.cp-lang-row').forEach((r) => {
          const hit = !q || (r.dataset.search || '').includes(q);
          r.hidden = !hit;
          if (hit) any++;
        });
        g.hidden = !any;
        shown += any;
      });
      if (empty) empty.hidden = shown > 0;
    });
  }

  function sheetBody(searchPh, groups, extra) {
    return `<div class="cp-lang-sheet">
      <input type="search" class="cp-lang-search" data-lang-search placeholder="${esc(searchPh)}" autocomplete="off" enterkeyhint="search">
      <div class="cp-lang-list" role="listbox">${groups}</div>
      <p class="cp-lang-empty" data-lang-empty hidden>${esc(tx('settings.lang_no_match', 'No match'))}</p>
      ${extra || ''}
    </div>`;
  }

  function openSheet(opts) {
    if (typeof openHalfSheet !== 'function') return null;
    return openHalfSheet(Object.assign({ expand: true }, opts));
  }

  /** App language — one tap applies (lazy-loads the pack) and syncs to the profile. */
  function openLanguagePicker(opts) {
    const o = opts || {};
    const cur = curLang();
    const device = typeof getDeviceLangs === 'function' ? getDeviceLangs().filter((c) => c !== cur) : [];
    const all = catalog().filter((l) => l.code !== cur && !device.includes(l.code));
    const groups =
      groupHtml(tx('settings.lang_current', 'Current'), [langRowHtml(entry(cur), { checked: true })]) +
      groupHtml(tx('settings.lang_suggested', 'Suggested'), device.map((c) => langRowHtml(entry(c)))) +
      groupHtml(tx('settings.lang_all', 'All languages'), all.map((l) => langRowHtml(l)));
    return openSheet({
      id: 'cpLangPicker',
      title: esc(tx('settings.app_language', 'App language')),
      bodyHtml: sheetBody(tx('settings.lang_search_ph', 'Search languages'), groups),
      onMount(sheet, close) {
        wireSearch(sheet);
        sheet.querySelectorAll('.cp-lang-row').forEach((row) =>
          row.addEventListener('click', () => {
            const code = row.dataset.code;
            close();
            if (code === cur) return;
            if (typeof setAppLanguage === 'function') {
              Promise.resolve(setAppLanguage(code, { persistRemote: true, source: 'user' })).then(() => {
                refreshSettings();
                if (typeof o.onChange === 'function') o.onChange(code);
                if (typeof showToast === 'function') showToast(txv('settings.lang_changed', 'Language: {{lang}}', { lang: entry(code).native }));
              });
            }
          })
        );
      },
    });
  }

  /** Languages I read — multi-select; at least one stays on. */
  function openContentLangsPicker() {
    const chosen = new Set(typeof getContentLangs === 'function' ? getContentLangs() : ['en']);
    const ordered = catalog()
      .slice()
      .sort((a, b) => Number(chosen.has(b.code)) - Number(chosen.has(a.code)));
    const rows = ordered.map((l) => langRowHtml(l, { checked: chosen.has(l.code), multi: true }));
    const extra = `<p class="cp-lang-hint">${esc(tx('settings.content_langs_desc', 'Posts and news in these languages rank higher, and Translate uses the first one.'))}</p>
      <button type="button" class="btn btn--primary btn--block" data-lang-done>${esc(tx('common.done', 'Done'))}</button>`;
    return openSheet({
      id: 'cpContentLangs',
      title: esc(tx('settings.content_langs', 'Languages I read')),
      bodyHtml: sheetBody(tx('settings.lang_search_ph', 'Search languages'), groupHtml('', rows), extra),
      onMount(sheet, close) {
        wireSearch(sheet);
        sheet.querySelectorAll('.cp-lang-row').forEach((row) =>
          row.addEventListener('click', () => {
            const c = row.dataset.code;
            if (chosen.has(c) && chosen.size === 1) return;
            if (chosen.has(c)) chosen.delete(c);
            else chosen.add(c);
            const on = chosen.has(c);
            row.classList.toggle('is-on', on);
            row.setAttribute('aria-checked', on ? 'true' : 'false');
            row.querySelector('.cp-lang-check').textContent = on ? '✓' : '';
          })
        );
        sheet.querySelector('[data-lang-done]')?.addEventListener('click', () => {
          const order = catalog().map((l) => l.code).filter((c) => chosen.has(c));
          if (typeof setContentLangs === 'function') setContentLangs(order, { persistRemote: true });
          refreshSettings();
          close();
        });
      },
    });
  }

  function regionApi() {
    return typeof ChaupaalRegion !== 'undefined' ? ChaupaalRegion : null;
  }

  /** Region — searchable country list; detected country suggested, current pinned. */
  function openRegionPicker() {
    const R = regionApi();
    if (!R) return null;
    const lang = curLang();
    const cur = R.getRegion().country;
    const detected = R.detectRegion().country;
    const countries = R.listCountries(lang);
    const row = (c, on) =>
      `<button type="button" class="cp-lang-row${on ? ' is-on' : ''}" data-code="${esc(c.code)}" role="option" aria-selected="${on ? 'true' : 'false'}" data-search="${esc(fold(c.name + ' ' + c.en + ' ' + c.code))}">
        <span class="cp-lang-text"><span class="cp-lang-native">${esc(c.name)}</span><span class="cp-lang-en">${esc(R.COUNTRIES[c.code].currency)} · ${esc(R.COUNTRIES[c.code].callingCode)}</span></span>
        <span class="cp-lang-check" aria-hidden="true">${on ? '✓' : ''}</span>
      </button>`;
    const byCode = (code) => countries.find((c) => c.code === code);
    const groups =
      groupHtml(tx('settings.lang_current', 'Current'), [row(byCode(cur), true)]) +
      (detected !== cur ? groupHtml(tx('settings.region_detected', 'Detected on this device'), [row(byCode(detected))]) : '') +
      groupHtml(tx('settings.region_all', 'All countries and regions'), countries.filter((c) => c.code !== cur && c.code !== detected).map((c) => row(c)));
    return openSheet({
      id: 'cpRegionPicker',
      title: esc(tx('settings.region', 'Region')),
      bodyHtml: sheetBody(tx('settings.region_search_ph', 'Search countries'), groups),
      onMount(sheet, close) {
        wireSearch(sheet);
        sheet.querySelectorAll('.cp-lang-row').forEach((r) =>
          r.addEventListener('click', () => {
            close();
            if (r.dataset.code !== cur) R.setRegion(r.dataset.code, { persistRemote: true, source: 'user' });
            refreshSettings();
          })
        );
      },
    });
  }

  /** Paint the Settings rows with the current values. */
  function refreshSettings() {
    const lv = document.getElementById('langPickerValue');
    if (lv) lv.textContent = langLabel(curLang());
    const cv = document.getElementById('contentLangsValue');
    if (cv && typeof getContentLangs === 'function') cv.textContent = getContentLangs().map((c) => entry(c).native).join(', ');
    const rv = document.getElementById('regionPickerValue');
    const R = regionApi();
    if (rv && R) rv.textContent = R.countryName(R.getRegion().country, curLang());
    // Western digits: only offered where the locale's own digits aren't 0–9 (ar-SA, mr, bn …).
    const row = document.getElementById('westernDigitsRow');
    const F = typeof ChaupaalFormat !== 'undefined' ? ChaupaalFormat : null;
    if (row && F) {
      row.hidden = !F.localeUsesNativeDigits(F.baseLocale());
      const box = document.getElementById('toggleWesternDigits');
      if (box) box.checked = F.getDigitsPref() === 'latn';
    }
  }

  function wireDigits() {
    const box = document.getElementById('toggleWesternDigits');
    if (!box || box.dataset.wired === '1') return;
    box.dataset.wired = '1';
    box.addEventListener('change', () => {
      const F = typeof ChaupaalFormat !== 'undefined' ? ChaupaalFormat : null;
      if (!F) return;
      const v = box.checked ? 'latn' : '';
      F.setDigitsPref(v);
      if (typeof i18nProfileWrite === 'function') i18nProfileWrite({ digits: v || null });
    });
  }

  /** Onboarding chip: "Language: English · Change". */
  function chipHtml() {
    return `<button type="button" class="cp-lang-chip" data-lang-chip>🌐 <span data-lang-chip-label>${esc(
      txv('onboarding.lang_chip', 'Language: {{lang}} · Change', { lang: entry(curLang()).native })
    )}</span></button>`;
  }

  function wireChip(root) {
    const chip = root && root.querySelector('[data-lang-chip]');
    if (!chip) return;
    chip.addEventListener('click', () =>
      openLanguagePicker({
        onChange: () => {
          const label = chip.querySelector('[data-lang-chip-label]');
          if (label) label.textContent = txv('onboarding.lang_chip', 'Language: {{lang}} · Change', { lang: entry(curLang()).native });
        },
      })
    );
  }

  /** One-time, dismissible: the saved language was retired, so the app shows English. */
  function maybeShowRetiredNotice() {
    if (typeof takeRetiredLangNotice !== 'function') return false;
    const code = takeRetiredLangNotice();
    if (!code) return false;
    const host = document.querySelector('.device') || document.body;
    const bar = document.createElement('div');
    bar.className = 'cp-lang-notice';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>${esc(tx('settings.lang_retired_notice', 'Your language isn’t available yet — showing English'))}</span>
      <button type="button" class="cp-lang-notice-btn" data-notice-change>${esc(tx('settings.lang_change', 'Change'))}</button>
      <button type="button" class="cp-lang-notice-x" data-notice-close aria-label="${esc(tx('common.close', 'Close'))}">✕</button>`;
    host.appendChild(bar);
    const dismiss = () => bar.remove();
    bar.querySelector('[data-notice-close]').addEventListener('click', dismiss);
    bar.querySelector('[data-notice-change]').addEventListener('click', () => {
      dismiss();
      openLanguagePicker();
    });
    return true;
  }

  function wireSettings() {
    document.getElementById('langPickerBtn')?.addEventListener('click', () => openLanguagePicker());
    document.getElementById('contentLangsBtn')?.addEventListener('click', () => openContentLangsPicker());
    document.getElementById('regionPickerBtn')?.addEventListener('click', () => openRegionPicker());
    wireDigits();
    refreshSettings();
    ['chaupaal:lang-changed', 'chaupaal:content-langs-changed', 'chaupaal:region-changed'].forEach((ev) =>
      document.addEventListener(ev, refreshSettings)
    );
  }

  window.ChaupaalLangPicker = {
    openLanguagePicker,
    openContentLangsPicker,
    openRegionPicker,
    refreshSettings,
    chipHtml,
    wireChip,
    maybeShowRetiredNotice,
  };

  const boot = () => {
    wireSettings();
    setTimeout(maybeShowRetiredNotice, 1200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
