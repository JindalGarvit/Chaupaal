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
    '.loc-share-sheet',
    '.group-info-overlay',
    '.wrap-overlay',
    '.ai-keyboard',
    '#aiKeyboardEl',
    '.streak-milestone-overlay',
  ].join(',');

  function dismissEl(el) {
    if (!el || !el.isConnected) return;
    if (typeof window.dismissOverlay === 'function') {
      window.dismissOverlay(el);
      return;
    }
    const btn = el.querySelector(
      '[data-overlay-dismiss],[data-dismiss],.sheet-close,.icon-btn,.game-back-btn,#chatBack,.chat-back,[data-music-picker-close],[data-loc-share-close],[data-group-info-close]'
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
    el.remove();
  }

  function pruneDead() {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!stack[i].el || !stack[i].el.isConnected) stack.splice(i, 1);
      else if (stack[i].el.classList?.contains('hidden') && stack[i].el.classList.contains('modal-backdrop')) {
        stack.splice(i, 1);
      } else if (
        stack[i].el.classList?.contains('day-check-modal') &&
        !stack[i].el.classList.contains('open')
      ) {
        stack.splice(i, 1);
      }
    }
  }

  function syncLayerHistoryDepth() {
    layerHistoryDepth = Math.max(0, Math.min(layerHistoryDepth, stack.length));
  }

  /** Reset stack + history when UI diverged — last resort so back never bricks the app. */
  function recoverNavStack(reason) {
    console.warn('[nav-stack] recover', reason || 'desync');
    pruneDead();
    while (stack.length) {
      const top = stack.pop();
      try {
        top.dismiss();
      } catch (e) {
        dismissEl(top.el);
      }
    }
    layerHistoryDepth = 0;
    try {
      if (history.state?.chaupaalLayer) {
        history.replaceState(history.state?.chaupaalDeep ? { chaupaalDeep: true } : {}, '', location.pathname);
      }
    } catch (e) {}
    if (typeof pauseAllMusic === 'function') pauseAllMusic();
    if (typeof clearShellGlitches === 'function') clearShellGlitches('recoverNavStack');
    else if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
  }

  function pushLayer(el, dismissFn) {
    if (!el || !el.isConnected) return;
    if (el.dataset.navIgnore === '1') return;
    pruneDead();
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
    } catch (e) {}
  }

  function popHistoryForLayer() {
    if (layerHistoryDepth <= 0) return;
    layerHistoryDepth--;
    if (suppressingPop) return;
    try {
      if (history.state?.chaupaalLayer) {
        suppressingPop = true;
        history.back();
        setTimeout(() => {
          suppressingPop = false;
        }, 120);
      }
    } catch (e) {
      suppressingPop = false;
    }
  }

  function removeLayerForEl(el) {
    const idx = stack.findIndex((s) => s.el === el);
    if (idx < 0) return;
    stack.splice(idx, 1);
    syncLayerHistoryDepth();
    popHistoryForLayer();
  }

  function dismissTopLayer() {
    pruneDead();
    if (!stack.length) return false;
    const top = stack.pop();
    syncLayerHistoryDepth();
    suppressingPop = true;
    try {
      top.dismiss();
    } catch (e) {
      dismissEl(top.el);
    }
    popHistoryForLayer();
    setTimeout(() => {
      suppressingPop = false;
    }, 80);
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
    ['settingsModal', 'profileModal', 'notifModal'].forEach((id) => {
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

    if (history.state?.chaupaalLayer) {
      if (stack.length) {
        const top = stack.pop();
        syncLayerHistoryDepth();
        suppressingPop = true;
        try {
          top.dismiss();
        } catch (err) {
          dismissEl(top.el);
        }
        setTimeout(() => {
          suppressingPop = false;
        }, 80);
        e.stopImmediatePropagation?.();
        return;
      }
      recoverNavStack('popstate-layer-without-stack');
      e.stopImmediatePropagation?.();
      return;
    }

    if (stack.length > 0) {
      recoverNavStack('stack-without-layer-state');
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
