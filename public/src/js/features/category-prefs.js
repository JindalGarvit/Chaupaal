/**
 * Personalized category prefs — core / user / suggested tiers.
 *
 * Cadence: AI-suggested (kind:'suggested') auto-remove after 14 days unused
 * (no open/select). Core pinned never auto-removed. User-created persist
 * until manual delete.
 *
 * Storage: localStorage chaupaal_cat_prefs_v1 + merge into myCategories.
 * AI off: still offers static CATEGORY_SUGGESTIONS heuristics.
 */
(function () {
  'use strict';

  const PREFS_KEY = 'chaupaal_cat_prefs_v1';
  const SUGGEST_TTL_MS = 14 * 24 * 60 * 60 * 1000; // ~2 weeks unused
  const CORE_PINNED = [
    { id: 'core_all', name: 'all', emoji: '📰', kind: 'core', pinned: true },
    { id: 'core_saathi', name: 'saathi', emoji: '🤝', kind: 'core', pinned: true },
    { id: 'core_gk', name: 'GK', emoji: '🧠', kind: 'core', pinned: true },
    { id: 'core_sports', name: 'Sports', emoji: '🏏', kind: 'core', pinned: true },
    { id: 'core_tech', name: 'Tech', emoji: '💻', kind: 'core', pinned: true },
  ];

  function now() {
    return Date.now();
  }

  function loadPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return defaultPrefs();
      return {
        order: Array.isArray(raw.order) ? raw.order : [],
        items: Array.isArray(raw.items) ? raw.items : [],
        lastManageAt: Number(raw.lastManageAt) || 0,
      };
    } catch (e) {
      return defaultPrefs();
    }
  }

  function defaultPrefs() {
    const items = CORE_PINNED.map((c) => ({
      ...c,
      addedAt: now(),
      lastUsedAt: now(),
    }));
    return { order: items.map((i) => i.id), items, lastManageAt: 0 };
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {}
  }

  function pruneUnusedSuggested(prefs) {
    const cutoff = now() - SUGGEST_TTL_MS;
    const kept = prefs.items.filter((it) => {
      if (it.kind !== 'suggested') return true;
      if (it.pinned) return true;
      const used = Number(it.lastUsedAt) || Number(it.addedAt) || 0;
      return used >= cutoff;
    });
    if (kept.length !== prefs.items.length) {
      prefs.items = kept;
      const ids = new Set(kept.map((i) => i.id));
      prefs.order = prefs.order.filter((id) => ids.has(id));
    }
    return prefs;
  }

  function syncFromMyCategories(prefs) {
    if (typeof myCategories === 'undefined' || !Array.isArray(myCategories)) return prefs;
    myCategories.forEach((c) => {
      const name = c.name;
      if (!name) return;
      if (prefs.items.some((i) => i.name.toLowerCase() === String(name).toLowerCase())) return;
      const id = c.id || `user_${String(name).toLowerCase().replace(/\s+/g, '_')}`;
      prefs.items.push({
        id,
        name,
        emoji: c.emoji || '✨',
        kind: c.kind || 'user',
        pinned: !!c.pinned,
        addedAt: c.addedAt ? Date.parse(c.addedAt) || now() : now(),
        lastUsedAt: now(),
      });
      if (!prefs.order.includes(id)) prefs.order.push(id);
    });
    return prefs;
  }

  function getOrderedCategories() {
    let prefs = pruneUnusedSuggested(syncFromMyCategories(loadPrefs()));
    savePrefs(prefs);
    const byId = new Map(prefs.items.map((i) => [i.id, i]));
    const ordered = prefs.order.map((id) => byId.get(id)).filter(Boolean);
    prefs.items.forEach((it) => {
      if (!ordered.some((o) => o.id === it.id)) ordered.push(it);
    });
    return ordered;
  }

  function touchCategory(nameOrId) {
    const prefs = loadPrefs();
    const key = String(nameOrId || '').toLowerCase();
    prefs.items.forEach((it) => {
      if (it.id === nameOrId || String(it.name).toLowerCase() === key) {
        it.lastUsedAt = now();
      }
    });
    savePrefs(prefs);
  }

  function addUserCategory(name, emoji, kind = 'user', opts = {}) {
    const prefs = loadPrefs();
    const n = String(name || '').trim();
    if (!n) return null;
    if (prefs.items.some((i) => i.name.toLowerCase() === n.toLowerCase())) {
      if (typeof showToast === 'function') {
        showToast(typeof t === 'function' ? t('cat_exists', { name: n }) : 'Already added');
      }
      return null;
    }
    const id = `${kind}_${Date.now()}`;
    const pinned = kind === 'core' ? true : opts.pinned !== undefined ? !!opts.pinned : false;
    const item = {
      id,
      name: n,
      emoji: emoji || (typeof getCategoryEmoji === 'function' ? getCategoryEmoji(n) : '✨'),
      kind,
      pinned,
      addedAt: now(),
      lastUsedAt: now(),
    };
    prefs.items.unshift(item);
    prefs.order.unshift(id);
    savePrefs(prefs);
    if (typeof addCategory === 'function' && kind === 'user') {
      try {
        addCategory(n, item.emoji);
      } catch (e) {}
    }
    return item;
  }

  function removeCategoryPref(id) {
    const prefs = loadPrefs();
    const it = prefs.items.find((i) => i.id === id);
    if (!it) return false;
    if (it.kind === 'core' || it.pinned) {
      if (typeof showToast === 'function') {
        showToast(
          typeof t === 'function'
            ? t('cat_core_locked', 'Core categories stay pinned')
            : 'Core categories stay pinned'
        );
      }
      return false;
    }
    prefs.items = prefs.items.filter((i) => i.id !== id);
    prefs.order = prefs.order.filter((x) => x !== id);
    savePrefs(prefs);
    if (typeof removeCategory === 'function' && it.kind === 'user') {
      try {
        removeCategory(id);
      } catch (e) {}
    }
    return true;
  }

  function reorderCategories(orderedIds) {
    const prefs = loadPrefs();
    const set = new Set(prefs.items.map((i) => i.id));
    prefs.order = orderedIds.filter((id) => set.has(id));
    prefs.items.forEach((it) => {
      if (!prefs.order.includes(it.id)) prefs.order.push(it.id);
    });
    prefs.lastManageAt = now();
    savePrefs(prefs);
  }

  function heuristicSuggestions(limit = 8) {
    const have = new Set(getOrderedCategories().map((c) => c.name.toLowerCase()));
    const pool =
      typeof CATEGORY_SUGGESTIONS !== 'undefined' && Array.isArray(CATEGORY_SUGGESTIONS)
        ? CATEGORY_SUGGESTIONS
        : [
            { emoji: '🎵', name: 'Music' },
            { emoji: '🎮', name: 'Gaming' },
            { emoji: '✈️', name: 'Travel' },
            { emoji: '🍳', name: 'Food & Recipes' },
          ];
    // Prefer categories matching recent music / peepal interests
    let boost = [];
    try {
      const seeds = typeof MusicTaste !== 'undefined' ? MusicTaste.recommendSeeds?.() || [] : [];
      seeds.forEach((s) => {
        const hit = pool.find((p) => String(s).toLowerCase().includes(p.name.toLowerCase()));
        if (hit) boost.push(hit);
      });
    } catch (e) {}
    const merged = [...boost, ...pool].filter((s) => !have.has(s.name.toLowerCase()));
    const seen = new Set();
    return merged
      .filter((s) => {
        const k = s.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, limit)
      .map((s) => ({ ...s, kind: 'suggested' }));
  }

  function refreshSuggested() {
    const prefs = pruneUnusedSuggested(loadPrefs());
    // Drop old suggested, re-add heuristics (AI path deferred when gated off)
    prefs.items = prefs.items.filter((i) => i.kind !== 'suggested');
    prefs.order = prefs.order.filter((id) => prefs.items.some((i) => i.id === id));
    heuristicSuggestions(5).forEach((s) => {
      const id = `sug_${s.name.toLowerCase().replace(/\s+/g, '_')}`;
      if (prefs.items.some((i) => i.name.toLowerCase() === s.name.toLowerCase())) return;
      prefs.items.push({
        id,
        name: s.name,
        emoji: s.emoji,
        kind: 'suggested',
        pinned: false,
        addedAt: now(),
        lastUsedAt: now(),
      });
      prefs.order.push(id);
    });
    savePrefs(prefs);
    return getOrderedCategories();
  }

  function refreshAkhbaarCatBarFromPrefs() {
    try {
      if (typeof refreshAkhbaarCatBar === 'function') {
        refreshAkhbaarCatBar();
        return;
      }
      const bar = document.getElementById('akhbaarCatBar');
      if (bar) {
        bar.querySelectorAll('.akhbaar-cat-chip[data-cat-kind]').forEach((el) => el.remove());
        delete bar.dataset.wired;
        if (typeof initAkhbaarCatBar === 'function') initAkhbaarCatBar();
      }
    } catch (e) {}
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function openAddCategorySheet() {
    document.querySelector('.akh-add-cat-overlay')?.remove();

    const suggestions = heuristicSuggestions(4);
    const overlay = document.createElement('div');
    overlay.className = 'akh-add-cat-overlay';
    overlay.dataset.navManaged = '1';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Add category');
    overlay.innerHTML = `
      <div class="akh-add-cat-screen">
        <header class="akh-add-cat-head">
          <button type="button" class="akh-add-cat-back" data-add-cat-close aria-label="Close">←</button>
          <div class="akh-add-cat-title-wrap">
            <span class="akh-add-cat-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7B2CBF" stroke-width="2" stroke-linecap="round"><path d="M12 8v8M8 12h8"/></svg>
            </span>
            <h2>Add category</h2>
          </div>
        </header>
        <div class="akh-add-cat-body">
          <input type="text" class="akh-add-cat-input" data-add-cat-name placeholder="Category name…" maxlength="40" autocomplete="off">
          <label class="akh-add-cat-pin">
            <input type="checkbox" data-add-cat-pin checked>
            <span>Show on Akhbaar bar</span>
          </label>
          ${
            suggestions.length
              ? `<p class="akh-add-cat-sug-label">Suggestions</p>
          <div class="akh-add-cat-sug-grid">
            ${suggestions
              .map(
                (s) =>
                  `<button type="button" class="akh-add-cat-sug" data-add-sug-name="${escHtml(s.name)}" data-add-sug-emoji="${escHtml(s.emoji || '✨')}">${escHtml(s.emoji || '✨')} ${escHtml(s.name)}</button>`
              )
              .join('')}
          </div>`
              : ''
          }
          <button type="button" class="akh-add-cat-cta" data-add-cat-submit disabled>Add</button>
        </div>
      </div>`;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(overlay);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      } catch (e) {}
      overlay.remove();
      refreshAkhbaarCatBarFromPrefs();
    };

    if (typeof pushNavLayer === 'function') pushNavLayer(overlay, close);

    const nameInput = overlay.querySelector('[data-add-cat-name]');
    const submitBtn = overlay.querySelector('[data-add-cat-submit]');
    const pinToggle = overlay.querySelector('[data-add-cat-pin]');

    const syncSubmit = () => {
      if (submitBtn) submitBtn.disabled = !(nameInput?.value?.trim());
    };

    nameInput?.addEventListener('input', syncSubmit);
    requestAnimationFrame(() => nameInput?.focus());

    const commitAdd = (name, emoji, kind = 'user') => {
      const pinned = pinToggle?.checked !== false;
      const item = addUserCategory(name, emoji, kind, { pinned });
      if (item) close();
    };

    overlay.querySelector('[data-add-cat-close]')?.addEventListener('click', close);
    submitBtn?.addEventListener('click', () => {
      const name = nameInput?.value?.trim();
      if (!name) return;
      commitAdd(name, null, 'user');
    });
    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && nameInput.value?.trim()) {
        e.preventDefault();
        commitAdd(nameInput.value.trim(), null, 'user');
      }
    });

    overlay.querySelectorAll('[data-add-sug-name]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commitAdd(btn.dataset.addSugName, btn.dataset.addSugEmoji, 'user');
      });
    });
  }

  /** @deprecated Use openAddCategorySheet */
  function openCategoryManageSheet() {
    openAddCategorySheet();
  }

  /** Long-press manage removed — add via Add chip, swipe, or morph shortcut only. */
  function bindCategoryLongPress(_bar) {}

  window.CategoryPrefs = {
    getOrderedCategories,
    touchCategory,
    addUserCategory,
    removeCategoryPref,
    reorderCategories,
    refreshSuggested,
    heuristicSuggestions,
    openAddCategorySheet,
    openCategoryManageSheet,
    bindCategoryLongPress,
    SUGGEST_TTL_MS,
    CORE_PINNED,
  };
})();
