/**
 * Script fonts + layout safety (Global L1).
 *
 * Fonts: every script uses system fonts first (see i18n.css :lang() stacks). A web font is a
 * fallback, fetched lazily only for the active language's script — English first paint loads
 * nothing new. The Google Fonts face is renamed to a private family ("CP Devanagari" …) and given
 * local() sources first, so a phone that already has Noto installed never downloads it.
 *
 * Layout: user-typed fields get dir="auto"; chips / tabs / buttons that clip show their full text
 * as a tooltip (hover/focus) or, on touch, via long-press.
 */
(function () {
  'use strict';

  /** lang → Google Fonts family, our alias, weights. */
  const SCRIPT_FONTS = {
    hi: { family: 'Noto Sans Devanagari', alias: 'CP Devanagari', weights: [400, 600, 700] },
    mr: { family: 'Noto Sans Devanagari', alias: 'CP Devanagari', weights: [400, 600, 700] },
    bn: { family: 'Noto Sans Bengali', alias: 'CP Bengali', weights: [400, 600, 700] },
    ta: { family: 'Noto Sans Tamil', alias: 'CP Tamil', weights: [400, 600, 700] },
    te: { family: 'Noto Sans Telugu', alias: 'CP Telugu', weights: [400, 600, 700] },
    ar: { family: 'Noto Sans Arabic', alias: 'CP Arabic', weights: [400, 600, 700] },
    ur: { family: 'Noto Nastaliq Urdu', alias: 'CP Nastaliq', weights: [400, 700] },
    ja: { family: 'Noto Sans JP', alias: 'CP JP', weights: [400, 700] },
    ko: { family: 'Noto Sans KR', alias: 'CP KR', weights: [400, 700] },
    zh: { family: 'Noto Sans SC', alias: 'CP SC', weights: [400, 700] },
  };
  const WEIGHT_NAMES = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' };
  const loaded = new Set();

  function cssUrl(spec) {
    return `https://fonts.googleapis.com/css2?family=${spec.family.replace(/ /g, '+')}:wght@${spec.weights.join(';')}&display=swap`;
  }

  /** Rename each face to the alias and put local() copies first (keeps unicode-range subsets). */
  function rewriteFaces(css, spec) {
    const ps = spec.family.replace(/ /g, '');
    return String(css).replace(/@font-face\s*\{([^}]*)\}/g, (block, body) => {
      const w = Number((/font-weight:\s*(\d+)/.exec(body) || [])[1]) || 400;
      const name = WEIGHT_NAMES[w] || 'Regular';
      const locals = [w === 400 ? spec.family : `${spec.family} ${name}`, `${ps}-${name}`].map((n) => `local('${n}')`).join(', ');
      const next = body
        .replace(/font-family:\s*['"][^'"]+['"]/, `font-family: '${spec.alias}'`)
        .replace(/src:\s*/, `src: ${locals}, `)
        .replace(/font-display:\s*\w+/, 'font-display: swap');
      return '@font-face {' + next + '}';
    });
  }

  function ensureForLang(lang) {
    const code = typeof normalizeLang === 'function' ? normalizeLang(lang) : lang;
    const spec = SCRIPT_FONTS[code];
    if (!spec || loaded.has(spec.alias) || typeof fetch !== 'function' || typeof document === 'undefined') return Promise.resolve(false);
    loaded.add(spec.alias);
    return fetch(cssUrl(spec))
      .then((r) => (r.ok ? r.text() : ''))
      .then((css) => {
        if (!css) return false;
        const style = document.createElement('style');
        style.dataset.cpFont = spec.alias;
        style.textContent = rewriteFaces(css, spec);
        document.head.appendChild(style);
        return true;
      })
      .catch(() => {
        loaded.delete(spec.alias);
        return false; // system fonts still render the script
      });
  }

  // ─── dir="auto" for user-typed text ──────────────────────────────────────
  const TEXT_INPUT = 'textarea, input:not([type]), input[type="text"], input[type="search"], [contenteditable="true"]';
  function autoDir(el) {
    if (el && el.matches && el.matches(TEXT_INPUT) && !el.hasAttribute('dir')) el.setAttribute('dir', 'auto');
  }

  // ─── truncated label → full text ─────────────────────────────────────────
  const LABEL_SEL = 'button, .btn, .tab-btn, [class*="chip"], [role="tab"], .settings-link-text strong, .pill';
  function truncated(el) {
    return el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2);
  }
  function fullText(el) {
    return String(el.getAttribute('aria-label') || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function labelTarget(t) {
    const el = t && t.closest ? t.closest(LABEL_SEL) : null;
    return el && !el.closest('.game-overlay canvas') ? el : null;
  }
  function maybeTitle(e) {
    const el = labelTarget(e.target);
    if (!el || el.hasAttribute('title') || !truncated(el)) return;
    const text = fullText(el);
    if (text) {
      el.setAttribute('title', text);
      el.dataset.cpAutoTitle = '1';
    }
  }
  function longPressLabel(e) {
    const el = labelTarget(e.target);
    if (!el || el.classList.contains('tab-btn') || !truncated(el)) return;
    const text = fullText(el);
    if (text && typeof showToast === 'function') {
      e.preventDefault();
      showToast(text);
    }
  }

  function init() {
    try {
      ensureForLang(typeof currentLang !== 'undefined' ? currentLang : 'en');
    } catch (e) {}
    document.addEventListener('focusin', (e) => autoDir(e.target), true);
    document.addEventListener('pointerover', maybeTitle, { passive: true });
    document.addEventListener('focusin', maybeTitle, true);
    document.addEventListener('contextmenu', longPressLabel);
    document.querySelectorAll(TEXT_INPUT).forEach(autoDir);
  }

  window.ChaupaalFonts = { SCRIPT_FONTS, ensureForLang, rewriteFaces, cssUrl };
  window.ChaupaalLayout = { autoDir, truncated };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
