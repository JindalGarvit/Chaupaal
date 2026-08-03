/**
 * Personalized default bottom tab (habit learning).
 *
 * Learns which of the five tabs the user dwells on most during the first
 * ~8 minutes of a qualifying open, keyed by local hour stamps, and opens
 * that tab next time at a matching hour. Peepal is the cold-start fallback.
 *
 * ── Hour matching (±30 min) ──────────────────────────────────────────────
 * Map wall-clock time T to hour stamp H = round(totalMinutes / 60) % 24,
 * i.e. nearest hour *center* (H:00). Examples:
 *   9:20 → 9,  9:40 → 10,  9:30 → 10 (exact :30 rounds toward next hour),
 *   23:40 → 0,  0:20 → 0.
 * Opening at T therefore matches habit for H within ±30 minutes of H:00.
 *
 * ── Scoring ──────────────────────────────────────────────────────────────
 * Per-hour per-tab dwell uses EMA (α = 0.4) so habits stay dynamic; not
 * unbounded cumulative totals. `sessions` increments on each commit.
 *
 * ── Underdog election ────────────────────────────────────────────────────
 * After a commit, re-elect defaultTab for that stamp:
 *   - confidence low (< 2 sessions OR total EMA dwell < 75s) → peepal
 *   - else A = top, B = second
 *   - if A === currentDefault AND (scoreA − scoreB) < 30s → B (underdog)
 *   - else A
 *
 * ── Away / new open ──────────────────────────────────────────────────────
 * ≥ 20 minutes backgrounded (or page unload) ends the open and commits.
 * Short visibility blips do not reset the 8-minute observation window.
 *
 * ── Game overlays ────────────────────────────────────────────────────────
 * Full-screen `.game-overlay` / `.muqabala-overlay` pause attribution
 * entirely (time counts for no tab). Underlying tab is unchanged; we do
 * not credit "dangal habit" while a game covers the shell.
 *
 * ── Sync ─────────────────────────────────────────────────────────────────
 * Field: users/{uid}.tabHabits
 * Local is source offline. Merge per-hour: higher `sessions` wins;
 * tie → newer `updatedAt`. Device keys are per-uid (guest bucket separate).
 *
 * ── Overrides (do not fight) ─────────────────────────────────────────────
 * Deep links, viral challenge query, notification tab targets, and
 * explicit in-session navigation skip / beat habit apply.
 */
(function () {
  'use strict';

  const TABS = Object.freeze(['peepal', 'duniya', 'baithak', 'akhbaar', 'dangal']);
  const FALLBACK = 'peepal';
  const OBSERVE_MS = 8 * 60 * 1000;
  const AWAY_MS = 20 * 60 * 1000;
  const UNDERDOG_MS = 30 * 1000;
  const MIN_SESSIONS = 2;
  const MIN_TOTAL_DWELL_MS = 75 * 1000;
  const EMA_ALPHA = 0.4;
  const STORAGE_PREFIX = 'chaupaal_tab_habits_';
  const LAST_HIDDEN_KEY = 'chaupaal_tab_habits_last_hidden';
  const DATA_VERSION = 1;

  let store = emptyStore();
  let openState = null;
  let tickTimer = null;
  let appliedThisOpen = false;
  let userNavigated = false;
  let bootOverride = false;
  let habitApplying = false;
  let syncTimer = null;
  let started = false;

  function emptyStore() {
    return { version: DATA_VERSION, byHour: {}, updatedAt: 0 };
  }

  function emptyHour() {
    const dwell = {};
    TABS.forEach((t) => {
      dwell[t] = 0;
    });
    return {
      dwell,
      sessions: 0,
      defaultTab: FALLBACK,
      updatedAt: 0,
    };
  }

  function isValidTab(tab) {
    return TABS.indexOf(tab) !== -1;
  }

  /**
   * Nearest hour-center stamp (0–23). Exact half-hours round toward the
   * next hour (Math.round); 23:30 → 0.
   */
  function hourStampForDate(d) {
    const date = d instanceof Date ? d : new Date(d || Date.now());
    const totalMin = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    return Math.round(totalMin / 60) % 24;
  }

  function storageKeyForUid(uid) {
    return STORAGE_PREFIX + (uid || 'guest');
  }

  function currentUid() {
    try {
      return (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || null;
    } catch (e) {
      return null;
    }
  }

  function readLocal(uid) {
    try {
      const raw = localStorage.getItem(storageKeyForUid(uid));
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyStore();
      return normalizeStore(parsed);
    } catch (e) {
      return emptyStore();
    }
  }

  function writeLocal(uid, next) {
    store = normalizeStore(next);
    store.updatedAt = Date.now();
    try {
      localStorage.setItem(storageKeyForUid(uid), JSON.stringify(store));
    } catch (e) {}
    return store;
  }

  function normalizeStore(raw) {
    const out = emptyStore();
    if (!raw || typeof raw !== 'object') return out;
    out.version = DATA_VERSION;
    out.updatedAt = Number(raw.updatedAt) || 0;
    const byHour = raw.byHour && typeof raw.byHour === 'object' ? raw.byHour : {};
    Object.keys(byHour).forEach((k) => {
      const h = Number(k);
      if (!Number.isInteger(h) || h < 0 || h > 23) return;
      out.byHour[String(h)] = normalizeHour(byHour[k]);
    });
    return out;
  }

  function normalizeHour(raw) {
    const h = emptyHour();
    if (!raw || typeof raw !== 'object') return h;
    h.sessions = Math.max(0, Math.floor(Number(raw.sessions) || 0));
    h.updatedAt = Number(raw.updatedAt) || 0;
    h.defaultTab = isValidTab(raw.defaultTab) ? raw.defaultTab : FALLBACK;
    const dwell = raw.dwell && typeof raw.dwell === 'object' ? raw.dwell : {};
    TABS.forEach((t) => {
      const v = Number(dwell[t]);
      h.dwell[t] = Number.isFinite(v) && v > 0 ? v : 0;
    });
    return h;
  }

  function loadStore() {
    store = readLocal(currentUid());
    return store;
  }

  function persistStore() {
    return writeLocal(currentUid(), store);
  }

  function scheduleRemoteSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushToFirestore, 400);
  }

  function pushToFirestore() {
    try {
      if (typeof db === 'undefined' || !db || !currentUid()) return;
      db.collection('users')
        .doc(currentUid())
        .set({ tabHabits: store }, { merge: true })
        .catch(() => {});
    } catch (e) {}
  }

  /**
   * Merge rule (documented): per-hour take higher `sessions`;
   * on tie take newer `updatedAt`. Top-level updatedAt = max of both.
   */
  function mergeStores(local, remote) {
    const a = normalizeStore(local);
    const b = normalizeStore(remote);
    const out = emptyStore();
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    const keys = new Set([...Object.keys(a.byHour), ...Object.keys(b.byHour)]);
    keys.forEach((k) => {
      const la = a.byHour[k];
      const rb = b.byHour[k];
      if (!la) out.byHour[k] = normalizeHour(rb);
      else if (!rb) out.byHour[k] = normalizeHour(la);
      else if ((la.sessions || 0) > (rb.sessions || 0)) out.byHour[k] = normalizeHour(la);
      else if ((rb.sessions || 0) > (la.sessions || 0)) out.byHour[k] = normalizeHour(rb);
      else if ((la.updatedAt || 0) >= (rb.updatedAt || 0)) out.byHour[k] = normalizeHour(la);
      else out.byHour[k] = normalizeHour(rb);
    });
    return out;
  }

  function getHourEntry(hour) {
    const key = String(hour);
    if (!store.byHour[key]) store.byHour[key] = emptyHour();
    return store.byHour[key];
  }

  function resolveDefaultTabForHour(hour) {
    loadStore();
    const entry = store.byHour[String(hour)];
    if (!entry) return FALLBACK;
    if (!isConfident(entry)) return FALLBACK;
    return isValidTab(entry.defaultTab) ? entry.defaultTab : FALLBACK;
  }

  function resolveDefaultTabForNow(now) {
    return resolveDefaultTabForHour(hourStampForDate(now || Date.now()));
  }

  function isConfident(entry) {
    if (!entry || (entry.sessions || 0) < MIN_SESSIONS) return false;
    let total = 0;
    TABS.forEach((t) => {
      total += Number(entry.dwell[t]) || 0;
    });
    return total >= MIN_TOTAL_DWELL_MS;
  }

  function rankTabs(dwell) {
    return TABS.slice()
      .map((tab) => ({ tab, score: Number(dwell[tab]) || 0 }))
      .sort((a, b) => b.score - a.score || a.tab.localeCompare(b.tab));
  }

  function electDefault(entry) {
    if (!isConfident(entry)) {
      entry.defaultTab = FALLBACK;
      return entry.defaultTab;
    }
    const ranked = rankTabs(entry.dwell);
    const A = ranked[0];
    const B = ranked[1] || { tab: FALLBACK, score: 0 };
    const current = isValidTab(entry.defaultTab) ? entry.defaultTab : FALLBACK;
    if (A.tab === current && A.score - B.score < UNDERDOG_MS && B.score > 0) {
      entry.defaultTab = B.tab;
    } else {
      entry.defaultTab = A.tab;
    }
    return entry.defaultTab;
  }

  function activeBottomTab() {
    try {
      const btn = document.querySelector('.bottom-tabs .tab-btn.active');
      const tab = btn && btn.dataset ? btn.dataset.tab : null;
      return isValidTab(tab) ? tab : FALLBACK;
    } catch (e) {
      return FALLBACK;
    }
  }

  function isFullScreenGameOverlay() {
    try {
      if (typeof isGameOverlayActive === 'function' && isGameOverlayActive()) return true;
    } catch (e) {}
    try {
      const el = document.querySelector('.game-overlay, .muqabala-overlay');
      if (!el) return false;
      const style = window.getComputedStyle ? getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function hasBootOverride() {
    try {
      const params = new URLSearchParams(location.search || '');
      if (
        params.get('challenge') ||
        params.get('chat') ||
        params.get('post') ||
        params.get('user') ||
        params.get('profile') ||
        params.get('join') ||
        params.get('groupInvite') ||
        params.get('game')
      ) {
        return true;
      }
      const path = (location.pathname || '').replace(/\/+$/, '') || '/';
      if (/^\/(?:profile|u|post|p|chat|c|join|g)\//i.test(path)) return true;
      if (typeof parseDeepLink === 'function') {
        const route = parseDeepLink();
        if (route) return true;
      }
    } catch (e) {}
    return false;
  }

  function setPending(on) {
    try {
      document.documentElement.classList.toggle('tabs-habit-pending', !!on);
    } catch (e) {}
  }

  function paintTabClasses(tab) {
    if (!isValidTab(tab)) tab = FALLBACK;
    try {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('active', p.id === 'panel-' + tab);
      });
      const progressBar = document.getElementById('progressBar');
      if (progressBar) progressBar.style.display = tab === 'akhbaar' ? 'flex' : 'none';
    } catch (e) {}
  }

  function activateTabViaClick(tab) {
    if (!isValidTab(tab)) tab = FALLBACK;
    const btn = document.querySelector(`.bottom-tabs .tab-btn[data-tab="${tab}"]`);
    if (btn) {
      habitApplying = true;
      try {
        btn.click();
        return true;
      } catch (e) {
        return false;
      } finally {
        habitApplying = false;
      }
    }
    paintTabClasses(tab);
    return false;
  }

  function flushSlice(now) {
    if (!openState || !openState.observing || openState.committed) return;
    if (!openState.visible || openState.pausedForGame) {
      openState.sliceStartedAt = now;
      return;
    }
    const startedAt = openState.sliceStartedAt || now;
    const elapsed = Math.max(0, now - startedAt);
    if (elapsed > 0 && isValidTab(openState.activeTab)) {
      openState.dwell[openState.activeTab] = (openState.dwell[openState.activeTab] || 0) + elapsed;
    }
    openState.sliceStartedAt = now;
  }

  function observationRemaining(now) {
    if (!openState) return 0;
    return Math.max(0, OBSERVE_MS - (now - openState.openedAt));
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      try {
        onTick(Date.now());
      } catch (e) {}
    }, 1000);
  }

  function onTick(now) {
    if (!openState || openState.committed) {
      stopTick();
      return;
    }
    const game = isFullScreenGameOverlay();
    if (game !== openState.pausedForGame) {
      flushSlice(now);
      openState.pausedForGame = game;
      openState.sliceStartedAt = now;
    } else {
      flushSlice(now);
    }
    if (observationRemaining(now) <= 0) {
      commitOpen(now);
    }
  }

  function beginOpen(now, reason) {
    const n = now || Date.now();
    openState = {
      openedAt: n,
      hourStamp: hourStampForDate(n),
      dwell: {},
      activeTab: activeBottomTab(),
      sliceStartedAt: n,
      observing: true,
      committed: false,
      visible: typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true,
      pausedForGame: isFullScreenGameOverlay(),
      reason: reason || 'open',
    };
    TABS.forEach((t) => {
      openState.dwell[t] = 0;
    });
    appliedThisOpen = false;
    userNavigated = false;
    if (openState.visible && !openState.pausedForGame) startTick();
    else stopTick();
  }

  function commitOpen(now) {
    if (!openState || openState.committed) return;
    const n = now || Date.now();
    flushSlice(n);
    openState.committed = true;
    openState.observing = false;
    stopTick();

    let total = 0;
    TABS.forEach((t) => {
      total += openState.dwell[t] || 0;
    });
    // Ignore empty noise commits (e.g. instant background).
    if (total < 1000) return;

    loadStore();
    const entry = getHourEntry(openState.hourStamp);
    TABS.forEach((t) => {
      const sample = openState.dwell[t] || 0;
      const prev = Number(entry.dwell[t]) || 0;
      entry.dwell[t] = EMA_ALPHA * sample + (1 - EMA_ALPHA) * prev;
    });
    entry.sessions = (entry.sessions || 0) + 1;
    entry.updatedAt = n;
    electDefault(entry);
    persistStore();
    scheduleRemoteSync();
  }

  function endOpenForAway(now) {
    if (!openState) return;
    if (!openState.committed) commitOpen(now);
    openState = null;
    stopTick();
  }

  function onTabActivated(tab, opts) {
    const n = Date.now();
    const options = opts || {};
    if (!isValidTab(tab)) return;
    if (!openState) {
      // Late activation before startSession — remember active only.
      return;
    }
    if (!options.fromHabitApply && !habitApplying) {
      userNavigated = true;
    }
    flushSlice(n);
    openState.activeTab = tab;
    openState.sliceStartedAt = n;
  }

  function markOverride(reason) {
    bootOverride = true;
    setPending(false);
    try {
      window.__tabHabitsOverride = reason || true;
    } catch (e) {}
  }

  function prepareBoot() {
    loadStore();
    bootOverride = hasBootOverride();
    // Never leave panels invisible if apply is skipped / fails.
    setTimeout(() => setPending(false), 2200);
    if (bootOverride) {
      markOverride('boot_url');
      paintTabClasses(FALLBACK);
      setPending(false);
      return FALLBACK;
    }
    const preferred = resolveDefaultTabForNow();
    if (preferred !== FALLBACK) {
      setPending(true);
      paintTabClasses(preferred);
    } else {
      paintTabClasses(FALLBACK);
      setPending(false);
    }
    return preferred;
  }

  function applyDefaultTab(opts) {
    const options = opts || {};
    if (bootOverride && !options.force) {
      setPending(false);
      return FALLBACK;
    }
    if (hasBootOverride()) {
      markOverride('apply_url');
      setPending(false);
      return FALLBACK;
    }
    if (appliedThisOpen && !options.force) {
      setPending(false);
      return activeBottomTab();
    }
    if (userNavigated && !options.force) {
      setPending(false);
      return activeBottomTab();
    }
    const preferred = resolveDefaultTabForNow();
    appliedThisOpen = true;
    // Always go through the real tab-click path so inits / restoreAppShell run.
    activateTabViaClick(preferred);
    userNavigated = false;
    if (openState) openState.activeTab = preferred;
    setPending(false);
    return preferred;
  }

  function startSession() {
    if (started) return;
    started = true;
    loadStore();
    const now = Date.now();

    // Cold start always begins a new open.
    beginOpen(now, 'cold_start');

    if (!bootOverride) {
      applyDefaultTab();
    } else {
      setPending(false);
    }

    document.addEventListener('visibilitychange', () => {
      const t = Date.now();
      if (document.visibilityState === 'hidden') {
        try {
          localStorage.setItem(LAST_HIDDEN_KEY, String(t));
        } catch (e) {}
        if (openState) {
          flushSlice(t);
          openState.visible = false;
        }
        stopTick();
      } else {
        let hiddenAt = t;
        try {
          hiddenAt = Number(localStorage.getItem(LAST_HIDDEN_KEY) || t) || t;
        } catch (e) {}
        const away = t - hiddenAt;
        if (away >= AWAY_MS) {
          endOpenForAway(t);
          beginOpen(t, 'return_from_away');
          // New qualifying open — apply habit for the new hour stamp unless
          // something else already owns navigation this page lifetime.
          if (!bootOverride && !userNavigated) {
            appliedThisOpen = false;
            applyDefaultTab({ force: true });
          }
        } else if (openState) {
          openState.visible = true;
          openState.sliceStartedAt = t;
          openState.pausedForGame = isFullScreenGameOverlay();
          if (!openState.committed) startTick();
        } else {
          beginOpen(t, 'visible_without_open');
        }
      }
    });

    window.addEventListener('pagehide', () => {
      const t = Date.now();
      try {
        localStorage.setItem(LAST_HIDDEN_KEY, String(t));
      } catch (e) {}
      if (openState && !openState.committed) commitOpen(t);
    });
  }

  async function hydrateTabHabitsFromFirestore() {
    loadStore();
    const uid = currentUid();
    if (!uid || typeof db === 'undefined' || !db) return store;
    try {
      const snap = await db.collection('users').doc(uid).get();
      const remote = snap.exists ? snap.data()?.tabHabits : null;
      if (remote && typeof remote === 'object') {
        const local = readLocal(uid);
        store = mergeStores(local, remote);
        writeLocal(uid, store);
      } else {
        // Push local if remote empty and we have data.
        if (Object.keys(store.byHour || {}).length) scheduleRemoteSync();
      }
    } catch (e) {}

    // After merge, re-apply if this open still belongs to habit apply.
    if (started && !bootOverride && !userNavigated) {
      const preferred = resolveDefaultTabForNow();
      if (preferred !== activeBottomTab()) {
        appliedThisOpen = false;
        applyDefaultTab({ force: true });
      }
    }
    return store;
  }

  function onAuthUidChanged(uid) {
    // Switch device bucket; guests and accounts stay separate.
    store = readLocal(uid || null);
    if (uid) {
      hydrateTabHabitsFromFirestore().catch(() => {});
    }
  }

  // Eager local load + pending paint as soon as the script runs (DOM is
  // already available — this file loads at end of body, before main.js).
  try {
    loadStore();
    if (hasBootOverride()) {
      bootOverride = true;
    } else {
      const preferred = resolveDefaultTabForNow();
      if (preferred !== FALLBACK) {
        setPending(true);
        // Classes swap after panels exist; called again from prepareBoot.
        if (document.querySelector('.tab-panel')) paintTabClasses(preferred);
      }
    }
  } catch (e) {}

  window.TabHabits = {
    TABS,
    FALLBACK,
    OBSERVE_MS,
    AWAY_MS,
    UNDERDOG_MS,
    hourStampForDate,
    resolveDefaultTabForNow,
    resolveDefaultTabForHour,
    prepareBoot,
    applyDefaultTab,
    startSession,
    onTabActivated,
    markOverride,
    hydrateTabHabitsFromFirestore,
    onAuthUidChanged,
    loadStore,
    getStore: () => store,
    /** Test/helpers */
    electDefault,
    mergeStores,
    isConfident,
  };

  window.hydrateTabHabitsFromFirestore = hydrateTabHabitsFromFirestore;
})();
