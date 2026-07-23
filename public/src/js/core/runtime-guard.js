/**
 * App-wide runtime guard: shell recovery + client error reporting.
 * Features must never leave the shell unusable (blank tabs, stuck kb-open, dead nav).
 * Errors queue locally and flush to Firestore for the daily admin summary.
 */
(function () {
  'use strict';

  const QUEUE_KEY = 'chaupaal_client_error_queue';
  const MAX_QUEUE = 40;
  const MIN_REPORT_GAP_MS = 4000;
  let lastReportAt = 0;
  let flushing = false;

  function detectSurface() {
    try {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      if (standalone) return 'pwa';
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const narrow = Math.min(window.innerWidth, window.screen?.width || window.innerWidth) < 900;
      if (coarse || narrow) return 'mobile_web';
      return 'desktop';
    } catch (e) {
      return 'unknown';
    }
  }

  function clearShellGlitches(reason) {
    try {
      if (typeof clearKeyboardInset === 'function') {
        clearKeyboardInset();
      } else {
        document.documentElement.classList.remove('kb-open');
        document.documentElement.style.setProperty('--kb-inset', '0px');
        document.querySelectorAll('.cp-kb-lift').forEach((el) => el.classList.remove('cp-kb-lift'));
      }
      const tabs = document.querySelector('.bottom-tabs');
      if (tabs) {
        tabs.style.removeProperty('height');
        tabs.style.removeProperty('min-height');
        tabs.style.removeProperty('visibility');
        tabs.style.removeProperty('pointer-events');
        tabs.style.removeProperty('overflow');
        tabs.style.removeProperty('padding');
        tabs.style.removeProperty('border');
        tabs.style.removeProperty('opacity');
        tabs.style.removeProperty('transform');
      }
      // Orphan closed pickers that somehow linger
      document.querySelectorAll('.music-picker-sheet').forEach((el) => {
        if (!el.classList.contains('is-open') && el.dataset.guardStale === '1') {
          try {
            el.remove();
          } catch (e) {}
        }
      });
    } catch (e) {
      console.warn('[runtime-guard] clearShell', reason || '', e?.message || e);
    }
  }

  function readQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeQueue(list) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
    } catch (e) {}
  }

  function enqueue(payload) {
    const list = readQueue();
    list.push({
      ...payload,
      queuedAt: Date.now(),
    });
    writeQueue(list);
  }

  async function flushErrorQueue() {
    if (flushing) return;
    if (typeof db === 'undefined' || !db) return;
    if (typeof currentUser === 'undefined' || !currentUser?.uid) return;
    const list = readQueue();
    if (!list.length) return;
    flushing = true;
    const remaining = [];
    try {
      for (const item of list) {
        try {
          await db.collection('clientErrorReports').add({
            uid: currentUser.uid,
            message: String(item.message || 'unknown').slice(0, 500),
            feature: String(item.feature || 'unknown').slice(0, 80),
            stack: String(item.stack || '').slice(0, 1500),
            url: String(item.url || '').slice(0, 200),
            ua: String(item.ua || '').slice(0, 240),
            surface: String(item.surface || 'unknown').slice(0, 40),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          remaining.push(item);
        }
      }
      writeQueue(remaining);
    } finally {
      flushing = false;
    }
  }

  /**
   * Report a client issue (rate-limited). Never throws.
   * @param {{ message?: string, feature?: string, stack?: string, fatal?: boolean }} opts
   */
  function reportClientError(opts) {
    try {
      const now = Date.now();
      if (now - lastReportAt < MIN_REPORT_GAP_MS) return;
      lastReportAt = now;
      const payload = {
        message: String(opts?.message || 'error').slice(0, 500),
        feature: String(opts?.feature || 'runtime').slice(0, 80),
        stack: String(opts?.stack || '').slice(0, 1500),
        url: String(location.pathname + location.search).slice(0, 200),
        ua: String(navigator.userAgent || '').slice(0, 240),
        surface: detectSurface(),
        fatal: !!opts?.fatal,
      };
      enqueue(payload);
      flushErrorQueue();
      if (typeof trackEvent === 'function') {
        trackEvent('client_error', {
          feature: payload.feature,
          surface: payload.surface,
        });
      }
    } catch (e) {}
  }

  /**
   * Wrap a feature entrypoint so failures recover the shell instead of blanking UI.
   * @param {string} name
   * @param {Function} fn
   */
  function safeFeature(name, fn) {
    return function guardedFeature() {
      const args = arguments;
      try {
        const result = fn.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.catch((e) => {
            reportClientError({
              feature: name,
              message: e?.message || String(e),
              stack: e?.stack || '',
            });
            clearShellGlitches(name);
            if (typeof recoverNavStack === 'function') {
              try {
                recoverNavStack(name);
              } catch (err) {}
            }
            if (typeof showToast === 'function') {
              showToast('Something went wrong — you’re back on track');
            }
            return null;
          });
        }
        return result;
      } catch (e) {
        reportClientError({
          feature: name,
          message: e?.message || String(e),
          stack: e?.stack || '',
        });
        clearShellGlitches(name);
        if (typeof recoverNavStack === 'function') {
          try {
            recoverNavStack(name);
          } catch (err) {}
        }
        if (typeof showToast === 'function') {
          showToast('Something went wrong — you’re back on track');
        }
        return null;
      }
    };
  }

  window.addEventListener('error', (ev) => {
    reportClientError({
      feature: 'window.onerror',
      message: ev?.message || 'script error',
      stack: ev?.error?.stack || `${ev?.filename || ''}:${ev?.lineno || ''}`,
      fatal: true,
    });
    clearShellGlitches('window.onerror');
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason;
    reportClientError({
      feature: 'unhandledrejection',
      message: reason?.message || String(reason || 'rejection'),
      stack: reason?.stack || '',
    });
  });

  window.addEventListener('pageshow', () => clearShellGlitches('pageshow'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearShellGlitches('visible');
      flushErrorQueue();
    }
  });
  document.addEventListener('chaupaal:dismiss', () => clearShellGlitches('dismiss'));

  // Flush when auth becomes available
  const flushTimer = setInterval(() => {
    if (typeof currentUser !== 'undefined' && currentUser?.uid && typeof db !== 'undefined' && db) {
      flushErrorQueue();
    }
  }, 15000);
  // Stop polling after a long idle window — still flushed on visibility/login paths
  setTimeout(() => clearInterval(flushTimer), 10 * 60 * 1000);

  window.clearShellGlitches = clearShellGlitches;
  window.reportClientError = reportClientError;
  window.safeFeature = safeFeature;
  window.flushClientErrorQueue = flushErrorQueue;
})();
