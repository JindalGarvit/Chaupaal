/**
 * Shared environment / capability layer.
 *
 * ONE source of truth for "is this a PWA / mobile / desktop", viewport &
 * safe-area sizing, gesture-gated-audio capability, and auth readiness.
 * Features must read from window.ChaupaalEnv instead of re-deriving these
 * with ad-hoc matchMedia / userAgent checks (see CONVENTIONS.md).
 *
 * Why this exists:
 * - Bottom-nav was pushed off-screen on mobile browsers because layout
 *   relied on `min-height:100vh` (the *large* viewport that ignores the
 *   retractable URL bar). Standalone PWAs have no URL bar so it looked fine.
 *   We now drive layout height from a JS-measured `--app-height`.
 * - Music search intermittently 401'd on mobile because requests fired
 *   before Firebase auth finished initialising. `whenAuthReady()` gives
 *   every caller one shared readiness gate.
 */
(function () {
  'use strict';

  const mm = (q) => {
    try {
      return window.matchMedia(q).matches;
    } catch (e) {
      return false;
    }
  };

  function isStandalone() {
    return mm('(display-mode: standalone)') || window.navigator.standalone === true;
  }

  function isCoarsePointer() {
    return mm('(pointer: coarse)');
  }

  function isMobile() {
    const narrow = Math.min(window.innerWidth || 9999, window.screen?.width || 9999) < 768;
    const uaMobile = /android|iphone|ipod|ipad|mobile|silk|kindle/i.test(navigator.userAgent || '');
    return isCoarsePointer() || narrow || uaMobile;
  }

  function isDesktop() {
    return !isMobile();
  }

  /** CSS-friendly shell mode: mobile (&lt;768) | tablet (768–1023) | desktop (≥1024). */
  function layoutMode() {
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function applyLayoutMode() {
    try {
      document.documentElement.setAttribute('data-layout', layoutMode());
    } catch (e) {}
  }

  function isIOS() {
    return (
      /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
      // iPadOS 13+ reports as Mac but is touch-capable
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
    );
  }

  /** Coarse surface tag used for error reporting + analytics. */
  function surface() {
    if (isStandalone()) return 'pwa';
    if (isMobile()) return 'mobile_web';
    return 'desktop';
  }

  /**
   * Mobile browsers require audio.play() to run synchronously inside the
   * user's tap. Desktop generally allows deferred/programmatic play.
   */
  function needsAudioGesture() {
    return isMobile();
  }

  function safeAreaInsets() {
    const cs = getComputedStyle(document.documentElement);
    const px = (v) => parseInt(cs.getPropertyValue(v), 10) || 0;
    return {
      top: px('--safe-top'),
      bottom: px('--safe-bottom'),
      left: px('--safe-left'),
      right: px('--safe-right'),
    };
  }

  // ---- Viewport height driver -------------------------------------------
  // Set --app-height to the *actual* visible height so fixed app-shell columns
  // (and the bottom nav) never overflow behind mobile browser chrome.
  let rafId = 0;
  function applyViewport() {
    rafId = 0;
    const vv = window.visualViewport;
    // Prefer layout viewport when keyboard is closed; when measuring for shell
    // restore, always use the larger of vv.height and innerHeight so a stuck
    // keyboard inset can't permanently shrink --app-height.
    const vvH = Math.round(vv?.height || 0);
    const winH = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
    const h = Math.max(vvH, winH) || winH;
    if (h > 0) {
      document.documentElement.style.setProperty('--app-height', h + 'px');
    }
    document.documentElement.classList.toggle('is-standalone', isStandalone());
    document.documentElement.classList.toggle('is-mobile', isMobile());
    applyLayoutMode();
  }
  function scheduleViewport() {
    if (rafId) return;
    rafId = requestAnimationFrame(applyViewport);
  }

  /**
   * Heal shell after keyboard / Mehfil / overlay glitches.
   * Root cause of blank bottom: html.kb-open collapses .bottom-tabs to height:0;
   * Mehfil search focus can leave kb-open stuck when blur/viewport lag.
   * Dangal "healed" by remount + resize — every tab now calls this explicitly.
   */
  function restoreAppShell(reason) {
    try {
      if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
      else {
        document.documentElement.classList.remove('kb-open');
        document.documentElement.style.setProperty('--kb-inset', '0px');
        document.querySelectorAll('.cp-kb-lift').forEach((el) => el.classList.remove('cp-kb-lift'));
      }
    } catch (e) {}
    try {
      if (typeof clearShellGlitches === 'function') clearShellGlitches(reason || 'restoreAppShell');
    } catch (e) {}
    try {
      const ae = document.activeElement;
      if (ae && ae.closest?.('.mehfil-overlay')) {
        /* Keep Mehfil search focused — blur here swallowed the first Search tap. */
      } else if (
        ae &&
        (ae.matches?.(
          '.instant-compose-text, #instantText, .share-search-input, #peepalAiSearchInput, #khojIntentInput, #usInput, #commentInput, .peepal-ai-search-input, .khoj-intent-input'
        ) ||
          ae.closest?.(
            '.cp-half-sheet, #baithakInstantComposer, .chaupaal-share-sheet, .game-friend-sheet, .loc-share-sheet, .share-sheet'
          ))
      ) {
        ae.blur?.();
      }
    } catch (e) {}
    try {
      if (!document.querySelector('.mehfil-overlay')) {
        document.querySelector('.device')?.classList.remove('is-mehfil-open');
        document.documentElement.classList.remove('mehfil-open');
      }
    } catch (e) {}
    try {
      const device = document.querySelector('.device');
      if (device) {
        ['transform', 'top', 'bottom', 'height', 'max-height', 'overflow'].forEach((p) =>
          device.style.removeProperty(p)
        );
      }
      const html = document.documentElement;
      const body = document.body;
      ['overflow', 'position', 'height', 'max-height', 'touch-action'].forEach((p) => {
        html.style.removeProperty(p);
        body?.style.removeProperty(p);
      });
      html.classList.remove('scroll-lock', 'overlay-open', 'sheet-open');
      body?.classList.remove('scroll-lock', 'overlay-open', 'sheet-open');
    } catch (e) {}
    try {
      const tabs = document.querySelector('.bottom-tabs');
      if (tabs) {
        ['height', 'min-height', 'max-height', 'visibility', 'pointer-events', 'overflow', 'padding', 'border', 'opacity', 'transform', 'display'].forEach(
          (p) => tabs.style.removeProperty(p)
        );
      }
    } catch (e) {}
    try {
      applyViewport();
      scheduleViewport();
      setTimeout(scheduleViewport, 50);
      setTimeout(scheduleViewport, 200);
    } catch (e) {}
  }

  function initViewport() {
    applyViewport();
    window.addEventListener('resize', scheduleViewport, { passive: true });
    window.addEventListener('orientationchange', scheduleViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleViewport, { passive: true });
      window.visualViewport.addEventListener('scroll', scheduleViewport, { passive: true });
    }
    window.addEventListener('load', scheduleViewport, { passive: true, once: true });
    setTimeout(scheduleViewport, 300);
  }

  // ---- Auth readiness gate ----------------------------------------------
  let authReadyPromise = null;
  function whenAuthReady(timeoutMs = 8000) {
    try {
      const a = typeof auth !== 'undefined' ? auth : null;
      if (a && a.currentUser) return Promise.resolve(a.currentUser);
    } catch (e) {}
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = new Promise((resolve) => {
      let done = false;
      const finish = (user) => {
        if (done) return;
        done = true;
        if (user) {
          authReadyPromise = Promise.resolve(user);
        } else {
          // Timed out / no user — allow a later retry once auth finishes
          authReadyPromise = null;
        }
        resolve(user || null);
      };
      try {
        const a = typeof auth !== 'undefined' ? auth : null;
        if (!a || typeof a.onAuthStateChanged !== 'function') {
          finish(null);
          return;
        }
        if (a.currentUser) {
          finish(a.currentUser);
          return;
        }
        const unsub = a.onAuthStateChanged((user) => {
          try {
            unsub && unsub();
          } catch (e) {}
          finish(user);
        });
        // Never hang a request forever if auth init stalls.
        setTimeout(() => finish(a.currentUser || null), timeoutMs);
      } catch (e) {
        finish(null);
      }
    });
    return authReadyPromise;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initViewport);
  } else {
    initViewport();
  }

  applyLayoutMode();

  window.ChaupaalEnv = {
    isStandalone,
    isMobile,
    isDesktop,
    isIOS,
    isCoarsePointer,
    layoutMode,
    surface,
    needsAudioGesture,
    safeAreaInsets,
    whenAuthReady,
    refreshViewport: scheduleViewport,
    restoreAppShell,
  };
  window.restoreAppShell = restoreAppShell;
})();
