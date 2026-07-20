/**
 * Nav stack — professional mobile navigation:
 * - System / gesture back closes the top overlay instead of leaving the app
 * - Backdrop (scrim) tap dismisses modals & sheets
 * - Keeps a short history sentinel while layers are open
 */
(function () {
  'use strict';

  /** @type {{ el: Element, dismiss: Function, key: string }[]} */
  const stack = [];
  let seq = 0;
  let suppressingPop = false;
  let wired = false;

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
    '#closeFriendsSheet',
    '#gameFriendPicker',
    '#gameShareSheet',
    '.auth-overlay:not(.hidden)',
  ].join(',');

  function dismissEl(el) {
    if (!el || !el.isConnected) return;
    if (typeof window.dismissOverlay === 'function') {
      window.dismissOverlay(el);
      return;
    }
    const btn = el.querySelector(
      '[data-overlay-dismiss],[data-dismiss],.sheet-close,.icon-btn,.game-back-btn,#chatBack,.chat-back'
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
      }
    }
  }

  function pushLayer(el, dismissFn) {
    if (!el || !el.isConnected) return;
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
    } catch (e) {}
  }

  function removeLayerForEl(el) {
    const idx = stack.findIndex((s) => s.el === el);
    if (idx < 0) return;
    stack.splice(idx, 1);
    // Keep history aligned when closed via ✕ / backdrop / swipe (not system back)
    try {
      if (!suppressingPop && history.state && history.state.chaupaalLayer) {
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

  function dismissTopLayer() {
    pruneDead();
    if (!stack.length) return false;
    const top = stack.pop();
    suppressingPop = true;
    try {
      top.dismiss();
    } catch (e) {
      dismissEl(top.el);
    }
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

    // Full-screen scrims: click empty area closes
    el.addEventListener('click', (e) => {
      if (e.target !== el) return;
      // Don't dismiss game play surface by accident — only coach / share scrims
      if (el.classList.contains('game-overlay') && !e.target.classList.contains('game-coach')) return;
      if (el.classList.contains('game-coach')) {
        el.remove();
        removeLayerForEl(el);
        return;
      }
      dismissEl(el);
      removeLayerForEl(el);
    });

    // Modal backdrop: click dimmed area (not .modal panel)
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
    // Stop clicks inside panel from bubbling to backdrop
    panel.addEventListener('click', (e) => e.stopPropagation());
  }

  function ensureScrimForSheet(panel) {
    if (!panel || panel.dataset.hasScrim === '1') return null;
    const st = panel.getAttribute('style') || '';
    const looksSheet =
      panel.classList.contains('cp-sheet-panel') ||
      panel.classList.contains('premium-sheet') ||
      (/bottom:\s*0/.test(st) && /border-radius:\s*24px/.test(st));
    // Common game pickers / sheets mounted on .device as bottom panels
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
    if (el.classList?.contains('cp-sheet-scrim')) return;

    // Modal backdrops when shown
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
    if (stack.length) {
      // System / gesture back — dismiss top Chaupaal layer only
      const top = stack.pop();
      try {
        top.dismiss();
      } catch (err) {
        dismissEl(top.el);
      }
      // Stop deeplink handler from also tearing down parent views in the same tick
      e.stopImmediatePropagation?.();
      return;
    }
  }

  function observeDevice() {
    const device = document.querySelector('.device') || document.body;
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
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
    // Capture phase so we run before deeplinks popstate and can claim the event
    window.addEventListener('popstate', onPopState, true);
    watchModals();
    observeDevice();
    // Existing visible layers (rare)
    document.querySelectorAll(LAYER_SELECTORS).forEach(considerElement);

    // Escape / Android-style: also expose for touch.js
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && hasLayers()) {
        e.preventDefault();
        // Prefer history.back so stack stays consistent
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
  window.initNavStack = initNavStack;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavStack);
  } else {
    initNavStack();
  }
})();
