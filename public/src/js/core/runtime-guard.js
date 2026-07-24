/**
 * App-wide runtime guard: shell recovery, scoped recovery UI, client error reporting.
 * Features must never leave the shell unusable (blank tabs, stuck kb-open, dead nav).
 * Errors queue locally (rate-limited + deduped) and flush to Firestore cheaply.
 */
(function () {
  'use strict';

  const QUEUE_KEY = 'chaupaal_client_error_queue';
  const SESSION_KEY = 'chaupaal_client_error_session';
  const MAX_QUEUE = 24;
  const MAX_WRITES_PER_SESSION = 12;
  const DEDUP_WINDOW_MS = 60 * 1000;
  const MIN_REPORT_GAP_MS = 2500;
  const STACK_MAX = 1200;

  let lastReportAt = 0;
  let flushing = false;
  let recoveryVisible = false;
  /** @type {Map<string, { count: number, lastAt: number }>} */
  const dedupMap = new Map();

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

  function detectScreen() {
    try {
      if (document.getElementById('activeChatScreen')) return 'chat';
      if (document.querySelector('.music-picker-sheet.is-open')) return 'music_picker';
      if (document.getElementById('peepalDetail')?.classList.contains('open')) return 'peepal_detail';
      const tab = document.querySelector('.bottom-tabs .tab.active, .bottom-tabs button.active');
      const label = (tab?.textContent || tab?.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('akhbaar') || label.includes('news')) return 'akhbaar';
      if (label.includes('duniya')) return 'duniya';
      if (label.includes('peepal')) return 'peepal';
      if (label.includes('baithak')) return 'baithak';
      if (label.includes('dangal')) return 'dangal';
      return String(location.pathname || '/').slice(0, 80) || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  function readSessionMeta() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') return data;
    } catch (e) {}
    return { writes: 0, startedAt: Date.now() };
  }

  function writeSessionMeta(meta) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(meta));
    } catch (e) {}
  }

  function errorSignature(message, stack, feature) {
    const loc = String(stack || '')
      .split('\n')
      .slice(0, 2)
      .join('|')
      .replace(/\?[^:\s]+/g, '')
      .slice(0, 160);
    return [String(feature || ''), String(message || '').slice(0, 160), loc].join('::');
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
      document.querySelectorAll('.music-picker-sheet').forEach((el) => {
        if (!el.classList.contains('is-open') && el.dataset.guardStale === '1') {
          try {
            el.remove();
          } catch (e) {}
        }
      });
      // Closed pickers / scrims must never keep blocking taps
      document.querySelectorAll('.music-picker-scrim:not(.is-open)').forEach((el) => {
        try {
          el.style.pointerEvents = 'none';
        } catch (e) {}
      });
    } catch (e) {
      console.warn('[runtime-guard] clearShell', reason || '', e?.message || e);
    }
  }

  function ensureRecoveryStyles() {
    if (document.getElementById('cpRecoveryStyles')) return;
    const style = document.createElement('style');
    style.id = 'cpRecoveryStyles';
    style.textContent = `
      .cp-recovery-chip{
        position:absolute;left:12px;right:12px;bottom:calc(var(--tab-h,60px) + env(safe-area-inset-bottom,0px) + 12px);
        z-index:140;display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:12px 14px;border-radius:14px;border:1px solid rgba(43,39,48,.12);
        background:rgba(255,248,240,.96);color:var(--ink,#2B2730);
        box-shadow:0 8px 24px rgba(43,39,48,.14);font:600 13px/1.35 system-ui,sans-serif;
        cursor:pointer;touch-action:manipulation;
      }
      .cp-recovery-chip[hidden]{display:none!important;}
      .cp-recovery-chip span{flex:1;min-width:0;}
      .cp-recovery-chip strong{font-weight:800;}
      .cp-feature-error{
        margin:8px 0;padding:10px 12px;border-radius:12px;border:1px dashed rgba(230,57,70,.35);
        background:rgba(230,57,70,.06);color:var(--muted,#7A7280);font:600 12px/1.4 system-ui,sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  function hideRecoveryChip() {
    const chip = document.getElementById('cpRecoveryChip');
    if (chip) chip.hidden = true;
    recoveryVisible = false;
  }

  /**
   * Narrow recovery affordance — not a full-page takeover.
   * Tap continues: clear shell glitches, scrub orphan nav, dismiss chip.
   */
  function showRecoveryChip(opts) {
    try {
      ensureRecoveryStyles();
      const device = document.querySelector('.device') || document.body;
      let chip = document.getElementById('cpRecoveryChip');
      if (!chip) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.id = 'cpRecoveryChip';
        chip.className = 'cp-recovery-chip';
        chip.dataset.navIgnore = '1';
        chip.dataset.overlayOrphan = '1';
        chip.innerHTML = '<span><strong>Something went wrong</strong> — tap to continue</span>';
        chip.addEventListener('click', () => {
          hideRecoveryChip();
          clearShellGlitches('recovery-chip');
          try {
            if (typeof recoverNavStack === 'function') recoverNavStack('recovery-chip');
          } catch (e) {}
          if (typeof showToast === 'function') {
            showToast('You’re back — try that again');
          }
        });
        device.appendChild(chip);
      }
      const msg = opts?.message ? String(opts.message).slice(0, 80) : '';
      chip.querySelector('span').innerHTML = msg
        ? `<strong>Something went wrong</strong> — ${msg.replace(/</g, '&lt;')} · tap to continue`
        : '<strong>Something went wrong</strong> — tap to continue';
      chip.hidden = false;
      recoveryVisible = true;
    } catch (e) {}
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
    const sig = payload.signature || errorSignature(payload.message, payload.stack, payload.feature);
    const existing = list.find((item) => item.signature === sig);
    if (existing) {
      existing.count = (existing.count || 1) + (payload.count || 1);
      existing.lastAt = Date.now();
      existing.screen = payload.screen || existing.screen;
    } else {
      list.push({
        ...payload,
        signature: sig,
        count: payload.count || 1,
        queuedAt: Date.now(),
        lastAt: Date.now(),
      });
    }
    writeQueue(list);
  }

  function dayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function counterDocId(signature, day) {
    // Stable, path-safe id from signature (no PII)
    let hash = 0;
    const s = String(signature || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return `${day}_${hash.toString(36)}`;
  }

  async function flushErrorQueue() {
    if (flushing) return;
    if (typeof db === 'undefined' || !db) return;
    if (typeof currentUser === 'undefined' || !currentUser?.uid) return;
    const session = readSessionMeta();
    if ((session.writes || 0) >= MAX_WRITES_PER_SESSION) {
      writeQueue([]); // drop queued writes for this session once capped
      return;
    }
    const list = readQueue();
    if (!list.length) return;
    flushing = true;
    const remaining = [];
    try {
      for (const item of list) {
        if ((session.writes || 0) >= MAX_WRITES_PER_SESSION) {
          remaining.push(item);
          continue;
        }
        try {
          const day = dayKey();
          const sig = item.signature || errorSignature(item.message, item.stack, item.feature);
          const count = Math.max(1, Number(item.count) || 1);
          const counterRef = db.collection('clientErrorCounters').doc(counterDocId(sig, day));
          await counterRef.set(
            {
              day,
              signature: String(sig).slice(0, 240),
              message: String(item.message || 'unknown').slice(0, 500),
              feature: String(item.feature || 'unknown').slice(0, 80),
              screen: String(item.screen || 'unknown').slice(0, 80),
              surface: String(item.surface || 'unknown').slice(0, 40),
              // Coarse UA only — no user profile / chat / PII fields
              ua: String(item.ua || '').slice(0, 160),
              count: firebase.firestore.FieldValue.increment(count),
              lastStack: String(item.stack || '').slice(0, STACK_MAX),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          // Occasional sample doc (first occurrence only in this flush batch) for stack glance
          if (!item._sampled) {
            await db.collection('clientErrorReports').add({
              uid: currentUser.uid,
              message: String(item.message || 'unknown').slice(0, 500),
              feature: String(item.feature || 'unknown').slice(0, 80),
              screen: String(item.screen || 'unknown').slice(0, 80),
              stack: String(item.stack || '').slice(0, STACK_MAX),
              url: String(item.url || '').slice(0, 200),
              ua: String(item.ua || '').slice(0, 160),
              surface: String(item.surface || 'unknown').slice(0, 40),
              signature: String(sig).slice(0, 240),
              count,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          }
          session.writes = (session.writes || 0) + 1;
          writeSessionMeta(session);
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
   * Report a client issue (rate-limited + session-capped + deduped). Never throws.
   * Always logs to console — recovery UI must not hide problems from developers.
   * @param {{ message?: string, feature?: string, stack?: string, fatal?: boolean, screen?: string }} opts
   */
  function reportClientError(opts) {
    try {
      const message = String(opts?.message || 'error').slice(0, 500);
      const feature = String(opts?.feature || 'runtime').slice(0, 80);
      const stack = String(opts?.stack || '').slice(0, STACK_MAX);
      const screen = String(opts?.screen || detectScreen()).slice(0, 80);
      const fatal = !!opts?.fatal;

      console.error('[chaupaal]', feature, message, stack || '');

      const session = readSessionMeta();
      if ((session.writes || 0) >= MAX_WRITES_PER_SESSION && !fatal) {
        if (fatal) showRecoveryChip({ message: 'tap to continue' });
        return;
      }

      const sig = errorSignature(message, stack, feature);
      const now = Date.now();
      const prev = dedupMap.get(sig);
      if (prev && now - prev.lastAt < DEDUP_WINDOW_MS) {
        prev.count += 1;
        prev.lastAt = now;
        dedupMap.set(sig, prev);
        // Fold into queue as a count bump without a new network write immediately
        enqueue({
          message,
          feature,
          stack,
          screen,
          url: String(location.pathname + location.search).slice(0, 200),
          ua: String(navigator.userAgent || '').slice(0, 160),
          surface: detectSurface(),
          signature: sig,
          count: 1,
          fatal,
        });
        return;
      }
      dedupMap.set(sig, { count: 1, lastAt: now });

      if (now - lastReportAt < MIN_REPORT_GAP_MS && !fatal) {
        enqueue({
          message,
          feature,
          stack,
          screen,
          url: String(location.pathname + location.search).slice(0, 200),
          ua: String(navigator.userAgent || '').slice(0, 160),
          surface: detectSurface(),
          signature: sig,
          count: 1,
          fatal,
        });
        return;
      }
      lastReportAt = now;

      enqueue({
        message,
        feature,
        stack,
        screen,
        url: String(location.pathname + location.search).slice(0, 200),
        ua: String(navigator.userAgent || '').slice(0, 160),
        surface: detectSurface(),
        signature: sig,
        count: prev?.count || 1,
        fatal,
      });
      flushErrorQueue();

      if (typeof trackEvent === 'function') {
        trackEvent('client_error', {
          feature,
          surface: detectSurface(),
          screen,
        });
      }

      if (fatal) {
        clearShellGlitches('fatal');
        showRecoveryChip({ message: 'tap to continue' });
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
            try {
              if (typeof recoverNavStack === 'function') recoverNavStack(name);
            } catch (err) {}
            showRecoveryChip({ message: 'tap to continue' });
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
        try {
          if (typeof recoverNavStack === 'function') recoverNavStack(name);
        } catch (err) {}
        showRecoveryChip({ message: 'tap to continue' });
        return null;
      }
    };
  }

  /**
   * Render a scoped inline error inside a feature host (not full-page).
   * @param {Element|null} host
   * @param {string} [label]
   */
  function showFeatureError(host, label) {
    if (!host) return;
    try {
      ensureRecoveryStyles();
      let box = host.querySelector('.cp-feature-error');
      if (!box) {
        box = document.createElement('div');
        box.className = 'cp-feature-error';
        box.setAttribute('role', 'status');
        host.prepend(box);
      }
      box.textContent = label || 'Couldn’t load this — try again in a moment.';
    } catch (e) {}
  }

  window.addEventListener('error', (ev) => {
    reportClientError({
      feature: 'window.onerror',
      message: ev?.message || 'script error',
      stack: ev?.error?.stack || `${ev?.filename || ''}:${ev?.lineno || ''}`,
      fatal: true,
    });
    clearShellGlitches('window.onerror');
    showRecoveryChip({ message: 'tap to continue' });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason;
    reportClientError({
      feature: 'unhandledrejection',
      message: reason?.message || String(reason || 'rejection'),
      stack: reason?.stack || '',
      fatal: true,
    });
    clearShellGlitches('unhandledrejection');
    showRecoveryChip({ message: 'tap to continue' });
  });

  window.addEventListener('pageshow', () => clearShellGlitches('pageshow'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearShellGlitches('visible');
      flushErrorQueue();
    }
  });
  document.addEventListener('chaupaal:dismiss', () => clearShellGlitches('dismiss'));

  const flushTimer = setInterval(() => {
    if (typeof currentUser !== 'undefined' && currentUser?.uid && typeof db !== 'undefined' && db) {
      flushErrorQueue();
    }
  }, 15000);
  setTimeout(() => clearInterval(flushTimer), 10 * 60 * 1000);

  window.clearShellGlitches = clearShellGlitches;
  window.reportClientError = reportClientError;
  window.safeFeature = safeFeature;
  window.flushClientErrorQueue = flushErrorQueue;
  window.showRecoveryChip = showRecoveryChip;
  window.hideRecoveryChip = hideRecoveryChip;
  window.showFeatureError = showFeatureError;
})();
