/**
 * Accessibility helpers — focus trap + dialog labeling for overlays.
 * Wired from nav-stack when a layer is pushed / removed.
 */
(function () {
  'use strict';

  const FOCUSABLE =
    'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

  /** @type {WeakMap<Element, { previouslyFocused: Element|null, onKeyDown: Function }>} */
  const traps = new WeakMap();

  function focusableIn(root) {
    if (!root || !root.querySelectorAll) return [];
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return el.offsetParent !== null || el === document.activeElement || el.tagName === 'BODY';
    });
  }

  /**
   * Ensure overlay is announced as a dialog and trap Tab focus inside it.
   * @param {Element} el
   */
  function trapFocus(el) {
    if (!el || el.nodeType !== 1) return;
    releaseFocus(el);
    if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      const title =
        el.querySelector('.modal-title,.peepal-detail-title,.ask-header,.peepal-ask-header,.chat-header-name,.game-title,[data-dialog-title]') ||
        null;
      if (title) {
        if (!title.id) title.id = `dlg_title_${Date.now().toString(36)}`;
        el.setAttribute('aria-labelledby', title.id);
      } else {
        el.setAttribute('aria-label', 'Dialog');
      }
    }

    const previouslyFocused = document.activeElement;
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusableIn(el);
      if (!list.length) {
        e.preventDefault();
        try {
          el.focus();
        } catch (err) {}
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !el.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    traps.set(el, { previouslyFocused, onKeyDown });

    // Defer focus so opening animations / innerHTML settle
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const list = focusableIn(el);
      const preferred =
        el.querySelector('[data-autofocus],input:not([type="hidden"]),textarea,button.btn--primary,.btn--primary') ||
        list[0] ||
        el;
      try {
        preferred.focus({ preventScroll: true });
      } catch (e) {
        try {
          el.focus({ preventScroll: true });
        } catch (err) {}
      }
    });
  }

  /**
   * Release trap and restore focus to the opener when possible.
   * @param {Element} el
   */
  function releaseFocus(el) {
    if (!el) return;
    const state = traps.get(el);
    if (!state) return;
    el.removeEventListener('keydown', state.onKeyDown);
    traps.delete(el);
    const prev = state.previouslyFocused;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      try {
        prev.focus({ preventScroll: true });
      } catch (e) {}
    }
  }

  window.A11y = { trapFocus, releaseFocus, focusableIn };
  window.trapFocus = trapFocus;
  window.releaseFocus = releaseFocus;
})();
