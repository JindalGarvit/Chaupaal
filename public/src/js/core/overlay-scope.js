/**
 * Overlay scope — when a parent view (e.g. chat) closes, dismiss nested overlays
 * that were mounted on `.device` while it was open (AI keyboard, games, sheets).
 *
 * Prefer clicking the overlay's own back/close control so game timers / listeners
 * run their existing cleanup. Falls back to remove() + chaupaal:dismiss event.
 */
(function () {
  /** @type {Map<string, { root: Element, tracked: Set<Element>, observer: MutationObserver|null }>} */
  const scopes = new Map();

  const DISMISS_SELECTORS = [
    '#aiKbClose',
    '#chessBack',
    '#chessPickBack',
    '#slBack',
    '#ludoBack',
    '#unoBack',
    '#tttBack',
    '#wgBack',
    '#firBack',
    '#busBack',
    '#scribbleBack',
    '#scribbleClose',
    '#rrBack',
    '#cbBack',
    '#kkBack',
    '#kkDiffBack',
    '#closeCreator',
    '#closeGP',
    '#closeGamePicker',
    '#closeRitual',
    '#closeRitual2',
    '#closeRitual2Btn',
    '#groupGameBack',
    '#closeUnoVariant',
    '#closeLudoPick',
    '#storyClose',
    '#closeBaithakStory',
    '#dayCheckSkip',
    '#dayCheckSnooze',
    '[data-overlay-dismiss]',
    '[data-np-cancel]',
    '[data-cf-cancel]',
    '[data-music-picker-close]',
  ].join(',');

  const IGNORE_IDS = new Set([
    'toast',
    'settingsModal',
    'activeChatScreen',
    'quizCategorySheet',
    'muqabalaOverlay',
    'peepalDetail',
    'catDetail',
    'duniyaPostDetail',
    'duniyaDetail',
  ]);

  function shouldTrack(node, scopeRoot) {
    if (!node || node.nodeType !== 1) return false;
    if (node === scopeRoot) return false;
    if (node.id && IGNORE_IDS.has(node.id)) return false;
    if (node.dataset && node.dataset.overlayOrphan === '1') return false;
    if (node.classList && node.classList.contains('toast')) return false;
    return true;
  }

  function dismissOverlay(el) {
    if (!el || !el.isConnected) return;
    // Isolate each step: a throwing feature close must never abort nav/history cleanup
    try {
      if (typeof window.removeNavLayer === 'function') window.removeNavLayer(el);
    } catch (e) {}
    try {
      el.dispatchEvent(new CustomEvent('chaupaal:dismiss', { bubbles: false }));
    } catch (e) {}
    const btn = el.querySelector && el.querySelector(DISMISS_SELECTORS);
    if (btn) {
      try {
        btn.click();
        // If click only animated-closed and left the node, force-remove shortly after
        setTimeout(() => {
          try {
            if (el.isConnected) el.remove();
          } catch (err) {}
        }, 400);
        return;
      } catch (e) {
        try {
          el.remove();
        } catch (err) {}
        return;
      }
    }
    try {
      el.remove();
    } catch (e) {}
  }

  function closeAiKeyboard() {
    const kb = document.getElementById('aiKeyboardEl');
    if (!kb) return;
    const closeBtn = kb.querySelector('#aiKbClose');
    if (closeBtn) {
      try {
        closeBtn.click();
      } catch (e) {
        kb.remove();
      }
    } else {
      kb.remove();
    }
  }

  /**
   * Start tracking siblings appended to `.device` while this parent view is open.
   * @param {string} scopeId
   * @param {Element} [scopeRoot] parent element (e.g. chat screen)
   */
  function beginOverlayScope(scopeId, scopeRoot) {
    endOverlayScope(scopeId, { silent: true });
    const device = document.querySelector('.device');
    if (!device || !scopeId) return;

    const tracked = new Set();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (!shouldTrack(n, scopeRoot)) return;
          n.dataset.overlayScope = scopeId;
          tracked.add(n);
        });
        m.removedNodes.forEach((n) => {
          if (n.nodeType === 1) tracked.delete(n);
        });
      });
    });
    observer.observe(device, { childList: true });
    scopes.set(scopeId, { root: scopeRoot || null, tracked, observer });
  }

  /**
   * Dismiss every overlay tracked under this scope (and any leftover data-overlay-scope marks).
   */
  function endOverlayScope(scopeId, { silent = false } = {}) {
    const entry = scopes.get(scopeId);
    if (entry) {
      try {
        entry.observer?.disconnect();
      } catch (e) {}
      if (!silent) {
        // Per-overlay isolation: one bad dismiss cannot skip the rest or freeze nav
        [...entry.tracked].forEach((el) => {
          try {
            dismissOverlay(el);
          } catch (e) {
            try {
              el.remove();
            } catch (err) {}
          }
        });
      }
      scopes.delete(scopeId);
    }
    if (!silent) {
      document.querySelectorAll(`[data-overlay-scope="${scopeId}"]`).forEach((el) => {
        try {
          dismissOverlay(el);
        } catch (e) {
          try {
            el.remove();
          } catch (err) {}
        }
      });
      // AI keyboard is the most common orphan when not tracked yet
      try {
        if (scopeId === 'chat') closeAiKeyboard();
      } catch (e) {}
    }
  }

  /** Explicit register (optional; MutationObserver covers most cases). */
  function registerScopedOverlay(scopeId, el, cleanup) {
    if (!scopeId || !el) return () => {};
    el.dataset.overlayScope = scopeId;
    const entry = scopes.get(scopeId);
    if (entry) entry.tracked.add(el);
    if (typeof cleanup === 'function') {
      el.addEventListener('chaupaal:dismiss', cleanup, { once: true });
    }
    return () => {
      entry?.tracked.delete(el);
    };
  }

  window.beginOverlayScope = beginOverlayScope;
  window.endOverlayScope = endOverlayScope;
  window.dismissOverlay = dismissOverlay;
  window.closeAiKeyboard = closeAiKeyboard;
  window.registerScopedOverlay = registerScopedOverlay;
  window.OVERLAY_SCOPE_CHAT = 'chat';
})();
