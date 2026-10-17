/**
 * Nav stack — professional mobile navigation:
 * - System / gesture back closes the top overlay instead of leaving the app
 * - With no overlay open, back walks in-app (Dangal filter/section → earlier tabs → launch tab)
 *   and only leaves the app when there is nothing left to go back to
 * - Backdrop (scrim) tap dismisses modals & sheets
 *
 * History model: nav-stack owns every history entry the app adds. Entries are anonymous
 * `{ chaupaalLayer, navIdx }` slots; the wanted count is `layers + root steps (+ spares)` and
 * `sync()` reconciles toward it. Programmatic pops are counted (not timed), and pushes wait until
 * those pops land — a slow phone can never let a stale pop close the screen that just opened.
 * Pushes also wait for a fresh user gesture (Chrome's history intervention).
 * Feature code must not pushState; use replaceState for cosmetic URLs and navBack() for "Back".
 *
 * @see CONVENTIONS.md — navigation/overlay contract
 */
(function () {
  'use strict';

  /** @type {{ el: Element, dismiss: Function, key: string }[]} */
  const stack = [];
  /** Base z-index for overlay stack — above chat chrome (~50) and tab bar (~40). */
  const BASE_OVERLAY_Z = 200;
  let seq = 0;
  let wired = false;
  /** Our entries above the base entry, once in-flight pops land. */
  let histDepth = 0;
  /** popstate events still owed to our own history.go(-n) calls. */
  let pendingPops = 0;
  let pendingTimer = null;
  let syncQueued = false;
  /** Chrome only honours entries pushed after a user gesture that followed the last traversal. */
  let gestureSinceTraversal = false;

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
    '.relationship-list-sheet',
    '#exclusionListManager',
    '.exclusion-list-overlay',
    '#closeFriendsManager',
    '.close-friends-manager-overlay',
    '.public-profile-sheet',
    '#publicProfileSheet',
    '.chat-screen',
    '#activeChatScreen',
    '.baithak-search-overlay',
    '#baithakSearchOverlay',
    '#notifPanelSheet',
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
    '.music-hub-sheet',
    '.flag-sheet',
    '.loc-share-sheet',
    '.group-info-overlay',
    '.wrap-overlay',
    '.ai-keyboard',
    '#aiKeyboardEl',
    '.streak-milestone-overlay',
    // Full-screen surfaces that previously bypassed the stack (system back
    // left the app / desynced history): onboarding, challenge creator,
    // story viewer, daily duel ritual, Mehfil.
    '.onboarding-overlay',
    '.challenge-creator',
    '.story-viewer',
    '.duel-ritual-overlay',
    '.mehfil-overlay',
    '#mehfilOverlay',
    '.chaupaal-hub-overlay',
    // Dangal launch surfaces (quiz category + AI finder) — permanent DOM
    // toggles; without these, Android back leaves the app instead of closing.
    '#quizCategorySheet',
    '.quiz-category-sheet',
    '#aiFinder',
    '.ai-finder-overlay',
  ].join(',');

  function dismissEl(el) {
    if (!el || !el.isConnected) return;
    if (typeof window.dismissOverlay === 'function') {
      window.dismissOverlay(el);
      return;
    }
    const btn = el.querySelector(
      '[data-overlay-dismiss],[data-dismiss],.sheet-close,.icon-btn,.game-back-btn,#chatBack,.chat-back,[data-music-picker-close],[data-music-hub-close],[data-loc-share-close],[data-group-info-close],#closeFlagSheet,[data-public-profile-close],[data-rel-list-back],[data-close-friends-back],[data-bs-back],[data-archive-back],[data-archive-hub-back],[data-hub-back],[data-as-close]'
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
      el.classList.contains('auth-overlay') ||
      el.id === 'quizCategorySheet' ||
      el.classList.contains('quiz-category-sheet') ||
      el.id === 'aiFinder' ||
      el.classList.contains('ai-finder-overlay')
    ) {
      el.classList.remove('open');
      el.classList.add('hidden');
      return;
    }
    el.remove();
  }

  function pruneDead() {
    const before = stack.length;
    pruneDeadEntries();
    if (stack.length !== before) {
      refreshStackZIndices();
      scheduleSync();
    }
  }

  function pruneDeadEntries() {
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

  // ─── History sync ──────────────────────────────────────────────────────────

  function entryIdx(state) {
    return state && state.chaupaalLayer ? Math.max(0, Number(state.navIdx) || 0) : 0;
  }

  /** One entry per Back the app can honestly absorb: open layers + in-app root steps. */
  function wantedDepth() {
    let root = 0;
    try {
      root = rootStepCount();
    } catch (e) {}
    return stack.length + root;
  }

  /**
   * Entries we keep in history. Spares absorb Backs that don't shrink the UI (a game showing
   * its leave confirm) — after a Back, Chrome only trusts new entries once the user taps again,
   * so we can't re-push; an untrusted push would make Back skip every app entry and exit.
   */
  const SPARE_ENTRIES = 3;
  /**
   * Shrinking history waits this long: screens often close and the next one opens a beat later
   * (opponent sheet → Practice vs AI loads async). Reusing the entries keeps Back working — once
   * popped, they can't be re-pushed until the next tap.
   */
  const SHRINK_GRACE_MS = 1200;
  let shrinkTimer = null;
  let shrinkDue = false;

  function cancelShrink() {
    clearTimeout(shrinkTimer);
    shrinkTimer = null;
    shrinkDue = false;
  }

  function armShrink() {
    if (shrinkTimer) return;
    shrinkTimer = setTimeout(() => {
      shrinkTimer = null;
      shrinkDue = true;
      scheduleSync();
    }, SHRINK_GRACE_MS);
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    // Microtask: a close + open in the same tick (sheet → game) nets out with no history churn.
    Promise.resolve().then(sync);
  }

  function armPendingTimer() {
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      // The pop never arrived (blocked traversal) — trust what the browser shows now.
      pendingPops = 0;
      histDepth = entryIdx(history.state);
      scheduleSync();
    }, 1500);
  }

  function sync() {
    syncQueued = false;
    if (pendingPops > 0) return;
    pruneDeadEntries();
    const logical = wantedDepth();
    const want = logical > 0 ? logical + SPARE_ENTRIES : 0;
    try {
      if (histDepth < want) {
        cancelShrink();
        // Short of entries: only push after a fresh tap — see SPARE_ENTRIES.
        while (gestureSinceTraversal && histDepth < want) {
          histDepth++;
          history.pushState({ chaupaalLayer: true, navIdx: histDepth, key: `nav_${++seq}` }, '');
        }
      } else if (histDepth <= want || (logical > 0 && histDepth <= want + SPARE_ENTRIES)) {
        // Extra spares while something is open are harmless — popping would cost a traversal.
        cancelShrink();
      } else if (!shrinkDue) {
        armShrink();
      } else {
        shrinkDue = false;
        const here = entryIdx(history.state);
        if (here !== histDepth) {
          histDepth = here;
          if (histDepth <= want) {
            scheduleSync();
            return;
          }
        }
        const n = histDepth - want;
        histDepth = want;
        pendingPops++;
        gestureSinceTraversal = false;
        armPendingTimer();
        history.go(-n);
      }
    } catch (e) {
      pendingPops = 0;
      histDepth = entryIdx(history.state);
    }
    if (pendingPops === 0) applyUrl();
  }

  // ─── Shareable URLs follow the top layer (chat, post) ──────────────────────

  /** Paths we showed for a layer — any of them left on screen with no layer reverts to '/'. */
  const ownedUrls = new Set();

  /** Show `url` while `el` (or the top layer when el is null) is open; the URL reverts on close. */
  function setNavLayerUrl(el, url) {
    const entry = el ? stack.find((s) => s.el === el) : stack[stack.length - 1];
    if (!entry || !url) return;
    entry.url = String(url);
    ownedUrls.add(entry.url.split('?')[0]);
    // Applied by sync() once this layer's entry exists — never onto the entry below it.
    scheduleSync();
  }

  function applyUrl() {
    let url = null;
    for (let i = stack.length - 1; i >= 0 && !url; i--) url = stack[i].url || null;
    try {
      if (url) {
        if (location.pathname + location.search !== url) history.replaceState(history.state, '', url);
      } else if (ownedUrls.has(location.pathname)) {
        history.replaceState(history.state, '', '/' + location.hash);
      }
    } catch (e) {}
  }

  // ─── Root back (no overlay open) ───────────────────────────────────────────

  const TAB_SEL = '.bottom-tabs .tab-btn[data-tab]';
  let launchTab = null;
  let lastTab = null;
  let userActed = false;
  let tabBackInFlight = false;
  /** Tabs visited since the launch tab, most recent last. */
  let tabTrail = [];

  function activeTab() {
    return document.querySelector(`${TAB_SEL}.active`)?.dataset?.tab || null;
  }

  function onTabChanged() {
    const now = activeTab();
    if (!now || now === lastTab) return;
    const prev = lastTab;
    lastTab = now;
    if (!userActed || !launchTab) {
      // Boot / habit default — whatever is showing before the first touch is "home".
      launchTab = now;
      tabTrail = [];
    } else if (now === launchTab) {
      tabTrail = [];
    } else if (!tabBackInFlight) {
      tabTrail = tabTrail.filter((t) => t !== now && t !== prev);
      if (prev && prev !== launchTab) tabTrail.push(prev);
      if (tabTrail.length > 4) tabTrail = tabTrail.slice(-4);
    }
    tabBackInFlight = false;
    scheduleSync();
  }

  function clickTab(tab) {
    const btn = document.querySelector(`${TAB_SEL.replace('[data-tab]', `[data-tab="${tab}"]`)}`);
    if (!btn) return false;
    tabBackInFlight = true;
    btn.click();
    if (activeTab() !== tab) tabBackInFlight = false;
    return true;
  }

  function dangalFilterActive() {
    const f = window.__dangalManchFilter;
    if (!f || !(f.genre || f.live || (f.mode && f.mode !== 'all'))) return false;
    return !!document.querySelector('#panel-dangal .dangal-filter-chip[data-filter-kind="all"]');
  }

  function dangalSectionOff() {
    const section = typeof dangalSection === 'string' ? dangalSection : null;
    return !!(section && section !== 'manch' && typeof setDangalSection === 'function');
  }

  /** Backs a tab absorbs before leaving it (Dangal: clear the filter, then back to Manch). */
  function tabSubSteps(tab) {
    if (tab !== 'dangal') return 0;
    return (dangalFilterActive() ? 1 : 0) + (dangalSectionOff() ? 1 : 0);
  }

  /** Exact number of root Backs left before leaving the app — must mirror rootBackStep(). */
  function rootStepCount() {
    const tab = activeTab();
    if (!tab) return 0;
    let n = tabSubSteps(tab);
    if (launchTab && tab !== launchTab) {
      tabTrail.forEach((t) => (n += 1 + tabSubSteps(t)));
      n += 1 + tabSubSteps(launchTab);
    }
    return n;
  }

  /** One in-app step back when no overlay is open, or null when leaving the app is the honest answer. */
  function rootBackStep() {
    const tab = activeTab();
    if (!tab) return null;
    if (tab === 'dangal') {
      if (dangalFilterActive()) {
        return () => document.querySelector('#panel-dangal .dangal-filter-chip[data-filter-kind="all"]')?.click();
      }
      if (dangalSectionOff()) return () => setDangalSection('manch');
    }
    if (launchTab && tab !== launchTab) {
      const target = tabTrail.length ? tabTrail[tabTrail.length - 1] : launchTab;
      return () => {
        tabTrail = tabTrail.filter((t) => t !== target);
        clickTab(target);
      };
    }
    return null;
  }

  /**
   * Handle one Back: close the top layer (games get first say via their own back button),
   * else take an in-app root step. Returns false when there is nothing left in the app.
   */
  function backOnce() {
    pruneDead();
    if (stack.length) {
      const peek = stack[stack.length - 1];
      const gameBack =
        peek.el.classList.contains('game-overlay') && peek.el.querySelector('.game-back-btn');
      if (gameBack) {
        // Games own their exit (leave confirm, forfeit warning, step back a screen).
        try {
          const coach = peek.el.querySelector('.game-coach [data-coach-dismiss]');
          const stay =
            document.querySelector('#gameLeaveConfirm [data-leave-stay]') ||
            document.querySelector('.chess-sheet .chess-sheet__cancel');
          (coach || stay || gameBack).click();
        } catch (err) {}
        return true;
      }
      const top = stack.pop();
      refreshStackZIndices();
      try {
        if (typeof releaseFocus === 'function') releaseFocus(top.el);
      } catch (e) {}
      safeDismissLayer(top);
      return true;
    }
    const step = rootBackStep();
    if (step) {
      try {
        step();
      } catch (e) {}
      return true;
    }
    return false;
  }

  /** In-app Back for buttons / Escape / swipe — same result as the system back gesture. */
  function navBack() {
    const handled = backOnce();
    scheduleSync();
    return handled;
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
      try {
        if (typeof releaseFocus === 'function') releaseFocus(top.el);
      } catch (e) {}
      safeDismissLayer(top);
    }
    scheduleSync();
    try {
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
    } catch (e) {}
    if (typeof restoreAppShell === 'function') restoreAppShell('recoverNavStack');
    else if (typeof clearShellGlitches === 'function') clearShellGlitches('recoverNavStack');
    else if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
  }

  /**
   * Normalize dismiss: function, or legacy `{ onPop }` / `{ onDismiss }` objects
   * that some call sites passed by mistake.
   */
  function normalizeDismissFn(el, dismissFn) {
    if (typeof dismissFn === 'function') return dismissFn;
    if (dismissFn && typeof dismissFn.onPop === 'function') {
      return () => dismissFn.onPop();
    }
    if (dismissFn && typeof dismissFn.onDismiss === 'function') {
      return () => dismissFn.onDismiss();
    }
    return () => dismissEl(el);
  }

  /**
   * Preferred entry for new overlays/sheets. Registers with nav-stack, appends
   * into the app shell, and returns `{ close }` so callers never skip history.
   *
   * @param {Element} el
   * @param {Function|{onPop?:Function,onDismiss?:Function}|null} [onDismiss]
   * @param {{ host?: Element, remove?: boolean, role?: string, label?: string }} [opts]
   * @returns {{ el: Element, close: Function }|null}
   */
  function openLayer(el, onDismiss, opts) {
    if (!el || el.nodeType !== 1) return null;
    const options = opts && typeof opts === 'object' ? opts : {};
    const host =
      options.host ||
      document.getElementById('device') ||
      document.querySelector('.device') ||
      document.body;
    el.dataset.navManaged = '1';
    if (options.role) el.setAttribute('role', options.role);
    if (options.label) el.setAttribute('aria-label', options.label);
    if (!el.isConnected && host) {
      try {
        host.appendChild(el);
      } catch (e) {
        return null;
      }
    }
    if (!el.isConnected) return null;

    let closed = false;
    const runDismiss = normalizeDismissFn(el, onDismiss);
    const dismiss = () => {
      if (closed) return;
      closed = true;
      try {
        runDismiss();
      } catch (e) {
        console.warn('[nav-stack] openLayer dismiss', e?.message || e);
      }
      if (options.remove !== false && el.isConnected) {
        try {
          el.remove();
        } catch (e) {}
      }
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('openLayer');
        else if (typeof clearShellGlitches === 'function') clearShellGlitches('openLayer');
      } catch (e) {}
    };

    pushLayer(el, dismiss);

    return {
      el,
      close() {
        if (closed) return;
        if (el.dataset.navLayer) removeLayerForEl(el);
        dismiss();
      },
    };
  }

  function applyLayerZIndex(el, depth) {
    if (!el) return;
    const z = BASE_OVERLAY_Z + depth * 10;
    el.style.zIndex = String(z);
    // Its dimming scrim must ride just under it — at the CSS default it hides behind games.
    const scrim = el.previousElementSibling;
    if (scrim && scrim.classList.contains('cp-sheet-scrim')) scrim.style.zIndex = String(z - 1);
  }

  function refreshStackZIndices() {
    stack.forEach((entry, i) => {
      if (entry.el?.isConnected) applyLayerZIndex(entry.el, i + 1);
    });
  }

  function pushLayer(el, dismissFn) {
    if (!el || !el.isConnected) return;
    if (el.dataset.navIgnore === '1') return;
    pruneDead();
    if (stack.some((s) => s.el === el)) return;

    const key = `layer_${++seq}`;
    el.dataset.navLayer = key;
    const dismiss = normalizeDismissFn(el, dismissFn);
    stack.push({ el, dismiss, key });
    refreshStackZIndices();
    scheduleSync();
    // Focus trap + dialog semantics (CONVENTIONS / Phase D a11y)
    try {
      if (typeof trapFocus === 'function') trapFocus(el);
    } catch (e) {}
  }

  function removeLayerForEl(el) {
    const idx = stack.findIndex((s) => s.el === el);
    if (idx < 0) return;
    try {
      if (typeof releaseFocus === 'function') releaseFocus(el);
    } catch (e) {}
    stack.splice(idx, 1);
    refreshStackZIndices();
    scheduleSync();
  }

  function dismissTopLayer() {
    pruneDead();
    if (!stack.length) return false;
    const top = stack.pop();
    refreshStackZIndices();
    try {
      if (typeof releaseFocus === 'function') releaseFocus(top.el);
    } catch (e) {}
    safeDismissLayer(top);
    scheduleSync();
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
    ['settingsModal', 'profileModal', 'notifModal', 'muqabalaOverlay', 'quizCategorySheet', 'aiFinder'].forEach((id) => {
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
    const landed = entryIdx(e.state);
    gestureSinceTraversal = false;
    if (pendingPops > 0) {
      // Our own history.go(-n) settling — never a user Back.
      pendingPops--;
      histDepth = landed;
      e.stopImmediatePropagation?.();
      if (pendingPops === 0) {
        clearTimeout(pendingTimer);
        scheduleSync();
      }
      return;
    }
    const steps = histDepth - landed;
    histDepth = landed;
    if (steps <= 0) {
      // Forward button, or an entry we don't own (legacy deep route) — reconcile only.
      if (landed > 0 || steps < 0) e.stopImmediatePropagation?.();
      scheduleSync();
      return;
    }
    e.stopImmediatePropagation?.();
    for (let i = 0; i < steps; i++) {
      if (!backOnce()) {
        leaveApp(landed);
        return;
      }
    }
    scheduleSync();
  }

  /**
   * Nothing left in the app: Back leaves, no prompt. Spare entries would otherwise swallow
   * this press, so step past them and the base entry in one traversal.
   */
  function leaveApp(landed) {
    cancelShrink();
    histDepth = 0;
    gestureSinceTraversal = false;
    try {
      pendingPops++;
      armPendingTimer();
      history.go(-(landed + 1));
    } catch (e) {
      pendingPops = 0;
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
    // A reload keeps our old entries above the page — adopt them so back stays honest.
    histDepth = entryIdx(history.state);
    watchModals();
    observeDevice();
    observeTabs();
    document.querySelectorAll(LAYER_SELECTORS).forEach(considerElement);

    const markActed = () => {
      if (userActed) return;
      userActed = true;
      if (!launchTab) launchTab = activeTab();
      lastTab = activeTab();
    };
    document.addEventListener('pointerdown', markActed, true);
    document.addEventListener('keydown', markActed, true);
    // Events that grant user activation — after one, entries we push are trusted by Back.
    const onGesture = (e) => {
      // __navTestGesture: browser dogfood scripts mark their taps as user taps.
      if (!e.isTrusted && !window.__navTestGesture) return;
      if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'BrowserBack')) return;
      markActed();
      gestureSinceTraversal = true;
      // Still tapping → maybe about to open something: keep the entries a little longer.
      if (shrinkTimer) {
        cancelShrink();
        armShrink();
      }
      scheduleSync();
    };
    ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'].forEach((t) =>
      document.addEventListener(t, onGesture, true)
    );
    // Overlays that close by class toggle (no DOM removal) and Dangal filter/section taps change
    // what Back should do — reconcile after every tap's handlers have run.
    document.addEventListener('click', () => setTimeout(pruneAndSync, 0));
    document.addEventListener('transitionend', pruneAndSync);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && hasLayers()) {
        e.preventDefault();
        navBack();
      }
    });
    scheduleSync();
  }

  function pruneAndSync() {
    pruneDead();
    scheduleSync();
  }

  function observeTabs() {
    lastTab = activeTab();
    launchTab = lastTab;
    const bar = document.querySelector('.bottom-tabs');
    if (!bar) return;
    new MutationObserver(onTabChanged).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  window.navBack = navBack;
  window.setNavLayerUrl = setNavLayerUrl;
  window.navStackSync = scheduleSync;
  window.pushNavLayer = pushLayer;
  window.openLayer = openLayer;
  window.removeNavLayer = removeLayerForEl;
  window.dismissTopNavLayer = dismissTopLayer;
  window.hasNavLayers = hasLayers;
  window.recoverNavStack = recoverNavStack;
  window.initNavStack = initNavStack;
  window.navStackDebug = () => ({
    stack: stack.map((s) => (s.el.id || String(s.el.className).split(' ')[0]) + (s.el.isConnected ? '' : '(dead)')),
    depth: histDepth,
    pending: pendingPops,
    want: wantedDepth(),
    launchTab,
    tabTrail: tabTrail.slice(),
    state: history.state,
    length: history.length,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavStack);
  } else {
    initNavStack();
  }
})();
