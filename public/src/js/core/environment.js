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
    const h = Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight);
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
  function initViewport() {
    applyViewport();
    window.addEventListener('resize', scheduleViewport, { passive: true });
    window.addEventListener('orientationchange', scheduleViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleViewport, { passive: true });
      window.visualViewport.addEventListener('scroll', scheduleViewport, { passive: true });
    }
    // URL bar collapse on first scroll / load settle
    window.addEventListener('load', scheduleViewport, { passive: true, once: true });
    setTimeout(scheduleViewport, 300);
  }

  // ---- Auth readiness gate ----------------------------------------------
  let authReadyPromise = null;
  function whenAuthReady(timeoutMs = 6000) {
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = new Promise((resolve) => {
      let done = false;
      const finish = (user) => {
        if (done) return;
        done = true;
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
  };
})();
