/**
 * Nav stack — professional mobile navigation:
 * - System / gesture back closes the top overlay instead of leaving the app
 * - Backdrop (scrim) tap dismisses modals & sheets
 * - One history.pushState({ chaupaalLayer }) per real overlay layer
 *
 * @see CONVENTIONS.md — navigation/overlay contract
 */
(function () {
  'use strict';

  /** @type {{ el: Element, dismiss: Function, key: string }[]} */
  const stack = [];
  let seq = 0;
  let suppressingPop = false;
  let wired = false;
  /** Layers we pushed onto history (source of truth for sync). */
  let layerHistoryDepth = 0;

  const LAYER_SELECTORS = [
    '.game-overlay',
    '.archive-overlay',
    '.muqabala-overlay',
    '.cp-action-sheet',
    '.cp-image-viewer',
    '#cpImageViewer',
    '#cpActionSheet',
    '#storyArchiveSheet',
    '#relationshipListSheet',
    '#closeFriendsManager',
    '#closeFriendsSheet',
    '#gameFriendPicker',
    '#gameShareSheet',
    '.auth-overlay:not(.hidden)',
    '.day-check-modal.open',
    '.chaupaal-graphic-card',
    '.chaupaal-inline-bubble',
    '.chaupaal-dropdown-nudge',
    '.name-prompt-sheet',
    '.confirm-prompt-sheet',
    '.music-picker-sheet',
    '.flag-sheet',
    '.loc-share-sheet',
    '.group-info-overlay',
    '.wrap-overlay',
    '.ai-keyboard',
    '#aiKeyboardEl',
    '.streak-milestone-overlay',
    // Full-screen surfaces that previously bypassed the stack (system back
    // left the app / desynced history): onboarding, challenge creator,
    // story viewer, daily duel ritual.
    '.onboarding-overlay',
    '.challenge-creator',
    '.story-viewer',
    '.duel-ritual-overlay',
  ].join(',');

  function dismissEl(el) {
    if (!el || !el.isConnected) return;
    if (typeof window.dismissOverlay === 'function') {
      window.dismissOverlay(el);
      return;
    }
    const btn = el.querySelector(
      '[data-overlay-dismiss],[data-dismiss],.sheet-close,.icon-btn,.game-back-btn,#chatBack,.chat-back,[data-music-picker-close],[data-loc-share-close],[data-group-info-close],#closeFlagSheet'
    );
    if (btn) {
      try {
        btn.click();
      } catch (e) {
        el.remove();
      }
      return;
    }
    if (el.classList.contains('modal-backdrop')) {
      el.classList.add('hidden');
      return;
    }
    // Permanent shell overlays — hide, never remove from DOM
    if (
      el.id === 'muqabalaOverlay' ||
      el.classList.contains('muqabala-overlay') ||
      el.classList.contains('auth-overlay')
    ) {
      el.classList.add('hidden');
      return;
    }
    el.remove();
  }

  function pruneDead() {
    for (let i = stack.length - 1; i >= 0; i--) {
      const el = stack[i].el;
      if (!el || !el.isConnected) {
        stack.splice(i, 1);
        continue;
      }
      // Persistent shell overlays that live in index.html must not stay on the
      // stack while .hidden — otherwise hasNavLayers() is always true and Back
      // / song-picker history desync (seen with #muqabalaOverlay).
      if (el.classList?.contains('hidden')) {
        stack.splice(i, 1);
        try {
          delete el.dataset.navLayer;
        } catch (e) {}
        continue;
      }
      if (
        el.classList?.contains('day-check-modal') &&
        !el.classList.contains('open')
      ) {
        stack.splice(i, 1);
        try {
          delete el.dataset.navLayer;
        } catch (e) {}
      }
    }
  }

  function syncLayerHistoryDepth() {
    layerHistoryDepth = Math.max(0, Math.min(layerHistoryDepth, stack.length));
  }

  /** Clear orphan {chaupaalLayer} history when the JS stack is already empty. */
  function clearOrphanLayerHistory() {
    try {
      if (!stack.length && history.state?.chaupaalLayer) {
        const next = history.state?.chaupaalDeep ? { chaupaalDeep: true } : {};
        history.replaceState(next, '', location.pathname + location.search + location.hash);
        layerHistoryDepth = 0;
      }
    } catch (e) {}
  }

  /**
   * Run a layer dismiss callback without letting feature errors corrupt the stack.
   * Always best-effort remove the DOM node if dismiss throws.
   */
  function safeDismissLayer(entry) {
    if (!entry) return;
    try {
      if (typeof entry.dismiss === 'function') entry.dismiss();
    } catch (e) {
      console.warn('[nav-stack] dismiss threw', e?.message || e);
      try {
        dismissEl(entry.el);
      } catch (err) {}
      if (typeof reportClientError === 'function') {
        try {
          reportClientError({
            feature: 'nav_layer_dismiss',
            message: e?.message || String(e),
            stack: e?.stack || '',
          });
        } catch (err) {}
      }
    }
  }

  /** Reset stack + history when UI diverged — last resort so back never bricks the app. */
  function recoverNavStack(reason) {
    console.warn('[nav-stack] recover', reason || 'desync');
    pruneDead();
    while (stack.length) {
      const top = stack.pop();
      safeDismissLayer(top);
    }
    layerHistoryDepth = 0;
    try {
      if (history.state?.chaupaalLayer) {
        history.replaceState(history.state?.chaupaalDeep ? { chaupaalDeep: true } : {}, '', location.pathname);
      }
    } catch (e) {}
    try {
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
    } catch (e) {}
    if (typeof clearShellGlitches === 'function') clearShellGlitches('recoverNavStack');
    else if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
  }

  function pushLayer(el, dismissFn) {
    if (!el || !el.isConnected) return;
    if (el.dataset.navIgnore === '1') return;
    pruneDead();
    clearOrphanLayerHistory();
    if (stack.some((s) => s.el === el)) return;

    const key = `layer_${++seq}`;
    el.dataset.navLayer = key;
    const dismiss =
      typeof dismissFn === 'function'
        ? dismissFn
        : () => {
            dismissEl(el);
          };
    stack.push({ el, dismiss, key });
    try {
      history.pushState({ chaupaalLayer: true, key }, '');
      layerHistoryDepth = stack.length;
    } catch (e) {
      // History push failed — keep stack entry but don't claim a history depth bump
      syncLayerHistoryDepth();
    }
  }

  function popHistoryForLayer() {
    if (layerHistoryDepth <= 0) {
      if (!suppressingPop) clearOrphanLayerHistory();
      return;
    }
    layerHistoryDepth--;
    if (suppressingPop) return;
    try {
      if (history.state?.chaupaalLayer) {
        suppressingPop = true;
        history.back();
        setTimeout(() => {
          suppressingPop = false;
          // Only scrub after back settles — never replaceState mid-flight
          if (!stack.length) clearOrphanLayerHistory();
        }, 120);
      } else {
        syncLayerHistoryDepth();
      }
    } catch (e) {
      suppressingPop = false;
      syncLayerHistoryDepth();
    }
  }

  function removeLayerForEl(el) {
    const idx = stack.findIndex((s) => s.el === el);
    if (idx < 0) {
      // Stale close while back is in flight — do not replaceState
      if (!stack.length && !suppressingPop) clearOrphanLayerHistory();
      return;
    }
    const isTop = idx === stack.length - 1;
    stack.splice(idx, 1);
    // CRITICAL: do NOT syncLayerHistoryDepth() before popHistoryForLayer.
    // Syncing first clamps depth to the new (smaller) stack length and skips
    // history.back(), leaving an orphan {chaupaalLayer} entry — that desyncs
    // chat back / deeplinks and freezes navigation after song-picker close.
    if (isTop) {
      popHistoryForLayer();
    } else {
      syncLayerHistoryDepth();
      if (!stack.length && !suppressingPop) clearOrphanLayerHistory();
    }
  }

  function dismissTopLayer() {
    pruneDead();
    if (!stack.length) {
      if (!suppressingPop) clearOrphanLayerHistory();
      return false;
    }
    const top = stack.pop();
    // Suppress during dismiss so close()→removeNavLayer does not scrub/back mid-flight
    suppressingPop = true;
    safeDismissLayer(top);
    suppressingPop = false;
    // Consume the matching history entry (depth still reflects pre-pop until here)
    popHistoryForLayer();
    syncLayerHistoryDepth();
    return true;
  }

  function hasLayers() {
    pruneDead();
    return stack.length > 0;
  }

  function wireBackdrop(el) {
    if (!el || el.dataset.backdropWired === '1') return;
    el.dataset.backdropWired = '1';

    el.addEventListener('click', (e) => {
      if (e.target !== el) return;
      if (el.classList.contains('game-overlay') && !e.target.classList.contains('game-coach')) return;
      if (el.classList.contains('game-coach')) {
        el.remove();
        removeLayerForEl(el);
        return;
      }
      if (
        el.classList.contains('chaupaal-graphic-card') ||
        el.classList.contains('name-prompt-sheet') ||
        el.classList.contains('day-check-modal')
      ) {
        dismissEl(el);
        removeLayerForEl(el);
        return;
      }
      dismissEl(el);
      removeLayerForEl(el);
    });

    if (el.classList.contains('modal-backdrop')) {
      el.addEventListener('click', (e) => {
        if (e.target !== el) return;
        const close =
          el.querySelector('#closeSettings,#closeProfile,#closeNotif,[data-dismiss],.sheet-close,.icon-btn');
        if (close) close.click();
        else el.classList.add('hidden');
        removeLayerForEl(el);
      });
    }
  }

  function wireSheetPanel(panel) {
    if (!panel || panel.dataset.sheetWired === '1') return;
    panel.dataset.sheetWired = '1';
    panel.addEventListener('click', (e) => e.stopPropagation());
  }

  function ensureScrimForSheet(panel) {
    if (!panel || panel.dataset.hasScrim === '1') return null;
    if (panel.dataset.navManaged === '1') return null;
    const st = panel.getAttribute('style') || '';
    const looksSheet =
      panel.classList.contains('cp-sheet-panel') ||
      panel.classList.contains('premium-sheet') ||
      (/bottom:\s*0/.test(st) && /border-radius:\s*24px/.test(st));
    const isBottomPanel =
      panel.parentElement?.classList?.contains('device') &&
      (st.includes('bottom:0') || st.includes('bottom: 0')) &&
      !panel.classList.contains('game-overlay') &&
      !panel.classList.contains('archive-overlay') &&
      !panel.classList.contains('modal-backdrop') &&
      !panel.classList.contains('auth-overlay') &&
      !panel.id?.includes('Chat');
    if (!looksSheet && !isBottomPanel) return null;
    panel.dataset.hasScrim = '1';
    const scrim = document.createElement('div');
    scrim.className = 'cp-sheet-scrim';
    scrim.dataset.navIgnore = '1';
    scrim.setAttribute('aria-hidden', 'true');
    panel.parentElement?.insertBefore(scrim, panel);
    const close = () => {
      try {
        const btn = panel.querySelector(
          '[data-dismiss],.sheet-close,#closeCreator,#closeGP,#closeGamePicker,#closeDuniyaStorySheet,[data-overlay-dismiss]'
        );
        if (btn) btn.click();
        else panel.remove();
      } catch (e) {
        panel.remove();
      }
      scrim.remove();
    };
    scrim.addEventListener('click', close);
    const mo = new MutationObserver(() => {
      if (!panel.isConnected) {
        scrim.remove();
        mo.disconnect();
      }
    });
    mo.observe(document.querySelector('.device') || document.body, { childList: true, subtree: true });
    return { scrim, close };
  }

  function considerElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.dataset.navIgnore === '1') return;
    if (el.dataset.navManaged === '1') return;
    if (el.classList?.contains('cp-sheet-scrim')) return;
    if (el.closest?.('[data-nav-ignore="1"]')) return;
    // Never register closed/hidden shell overlays (muqabala, auth, etc.)
    if (el.classList?.contains('hidden')) return;
    if (el.classList?.contains('day-check-modal') && !el.classList.contains('open')) return;

    if (el.classList?.contains('modal-backdrop') && !el.classList.contains('hidden')) {
      wireBackdrop(el);
      const modal = el.querySelector('.modal');
      if (modal) wireSheetPanel(modal);
      pushLayer(el, () => {
        const close = el.querySelector('#closeSettings,#closeProfile,#closeNotif,.icon-btn,[data-dismiss]');
        if (close) close.click();
        else el.classList.add('hidden');
      });
      return;
    }

    const scrimInfo = ensureScrimForSheet(el);
    if (scrimInfo) {
      pushLayer(el, scrimInfo.close);
      return;
    }

    if (el.matches?.(LAYER_SELECTORS) || el.classList?.contains('game-overlay') || el.classList?.contains('archive-overlay')) {
      if (el.classList.contains('day-check-modal') && !el.classList.contains('open')) return;
      wireBackdrop(el);
      const panel = el.querySelector('.modal,.cp-sheet-panel,[data-sheet-panel]');
      if (panel) wireSheetPanel(panel);
      if (el.classList.contains('game-coach')) {
        pushLayer(el, () => el.remove());
        return;
      }
      pushLayer(el);
      return;
    }

    el.querySelectorAll?.('.game-coach').forEach((coach) => {
      if (coach.dataset.navLayer) return;
      wireBackdrop(coach);
      pushLayer(coach, () => coach.remove());
    });
  }

  function watchModals() {
    ['settingsModal', 'profileModal', 'notifModal', 'muqabalaOverlay'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.navWatch === '1') return;
      el.dataset.navWatch = '1';
      const mo = new MutationObserver(() => {
        if (!el.classList.contains('hidden')) considerElement(el);
        else removeLayerForEl(el);
      });
      mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function onPopState(e) {
    if (suppressingPop) return;
    pruneDead();

    // Browser already consumed one history entry. If our JS stack still has a layer,
    // dismiss it here WITHOUT calling history.back() again (that would pop chat/deep routes).
    if (stack.length > 0) {
      const top = stack.pop();
      layerHistoryDepth = Math.max(0, layerHistoryDepth - 1);
      syncLayerHistoryDepth();
      suppressingPop = true;
      safeDismissLayer(top);
      setTimeout(() => {
        suppressingPop = false;
      }, 80);
      e.stopImmediatePropagation?.();
      return;
    }

    // Empty stack — scrub any orphan chaupaalLayer flag left by a buggy close path
    if (history.state?.chaupaalLayer) {
      clearOrphanLayerHistory();
      e.stopImmediatePropagation?.();
    }
  }

  function observeDevice() {
    const device = document.querySelector('.device') || document.body;
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.classList?.contains('cp-media-controls') || n.dataset?.cpMediaControls != null) return;
          if (n.closest?.('[data-music-card],[data-cp-media-controls]')) return;
          considerElement(n);
          n.querySelectorAll?.(LAYER_SELECTORS).forEach(considerElement);
        });
        m.removedNodes.forEach((n) => {
          if (n.nodeType === 1) removeLayerForEl(n);
        });
      });
    });
    mo.observe(device, { childList: true, subtree: true });
  }

  function initNavStack() {
    if (wired) return;
    wired = true;
    window.addEventListener('popstate', onPopState, true);
    watchModals();
    observeDevice();
    document.querySelectorAll(LAYER_SELECTORS).forEach(considerElement);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && hasLayers()) {
        e.preventDefault();
        try {
          history.back();
        } catch (err) {
          dismissTopLayer();
        }
      }
    });
  }

  window.pushNavLayer = pushLayer;
  window.removeNavLayer = removeLayerForEl;
  window.dismissTopNavLayer = dismissTopLayer;
  window.hasNavLayers = hasLayers;
  window.recoverNavStack = recoverNavStack;
  window.initNavStack = initNavStack;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavStack);
  } else {
    initNavStack();
  }
})();
