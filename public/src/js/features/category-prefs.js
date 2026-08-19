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

  function addUserCategory(name, emoji, kind = 'user') {
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
    const item = {
      id,
      name: n,
      emoji: emoji || (typeof getCategoryEmoji === 'function' ? getCategoryEmoji(n) : '✨'),
      kind,
      pinned: kind === 'core',
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

  function openCategoryManageSheet() {
    document.querySelector('.cat-manage-sheet')?.remove();
    document.querySelector('.cat-manage-scrim')?.remove();

    const cats = getOrderedCategories().filter((c) => c.name !== 'all' && c.name !== 'saathi');
    const suggestions = heuristicSuggestions(6);

    const scrim = document.createElement('div');
    scrim.className = 'music-picker-scrim cat-manage-scrim';
    scrim.dataset.navIgnore = '1';

    const sheet = document.createElement('div');
    sheet.className = 'music-picker-sheet cat-manage-sheet';
    sheet.dataset.navManaged = '1';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Manage categories');
    sheet.innerHTML = `
      <div class="music-picker-handle" aria-hidden="true"></div>
      <div class="music-picker-head">
        <div class="music-picker-title">Categories</div>
        <button type="button" class="music-picker-close" data-cat-manage-close aria-label="Close">✕</button>
      </div>
      <p class="cat-manage-hint">Long-press chips to reorder. Suggested ones fade if unused for 2 weeks. Suggested categories you haven't tapped in 2 weeks are removed automatically.</p>
      <div class="cat-manage-list" data-cat-manage-list>
        ${cats
          .map(
            (c, i) => `<div class="cat-manage-row" draggable="true" data-id="${c.id}" data-i="${i}">
            <span class="cat-manage-grip" aria-hidden="true">⋮⋮</span>
            <span class="cat-manage-emoji">${c.emoji || '✨'}</span>
            <span class="cat-manage-name">${c.name}</span>
            <span class="cat-manage-kind">${c.kind === 'core' ? 'Pinned' : c.kind === 'suggested' ? 'Suggested' : 'Yours'}</span>
            ${
              c.kind === 'core' || c.pinned
                ? ''
                : `<button type="button" class="cat-manage-del" data-del="${c.id}" aria-label="Remove">✕</button>`
            }
          </div>`
          )
          .join('')}
      </div>
      <div class="cat-manage-add">
        <div class="cat-manage-add-title">Add</div>
        <div class="cat-manage-suggestions">
          ${suggestions
            .map(
              (s) =>
                `<button type="button" class="cat-manage-sug" data-add-name="${s.name}" data-add-emoji="${s.emoji}" data-add-kind="suggested">${s.emoji} ${s.name}</button>`
            )
            .join('')}
        </div>
        <div class="cat-manage-custom">
          <input type="text" class="music-picker-input" data-cat-custom placeholder="Your category…" maxlength="40">
          <button type="button" class="music-hub-cta" data-cat-custom-add>Add</button>
        </div>
      </div>
      <button type="button" class="cat-manage-refresh" data-cat-refresh>Refresh suggestions</button>`;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(scrim);
    device.appendChild(sheet);
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      sheet.classList.add('is-open');
    });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      sheet.classList.remove('is-open');
      scrim.classList.remove('is-open');
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      } catch (e) {
        sheet.remove();
      }
      setTimeout(() => {
        sheet.remove();
        scrim.remove();
      }, 220);
      try {
        if (typeof initAkhbaarCatBar === 'function') {
          const bar = document.getElementById('akhbaarCatBar');
          if (bar) {
            bar.dataset.wired = '';
            initAkhbaarCatBar();
          }
        }
      } catch (e) {}
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-cat-manage-close]')?.addEventListener('click', close);
    scrim.addEventListener('click', close);

    const list = sheet.querySelector('[data-cat-manage-list]');
    let dragId = null;
    list?.querySelectorAll('.cat-manage-row').forEach((row) => {
      row.addEventListener('dragstart', () => {
        dragId = row.dataset.id;
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        const over = e.currentTarget;
        if (!dragId || over.dataset.id === dragId) return;
        const ids = [...list.querySelectorAll('.cat-manage-row')].map((r) => r.dataset.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(over.dataset.id);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        reorderCategories(ids);
        // Re-order DOM
        const map = new Map([...list.children].map((el) => [el.dataset.id, el]));
        ids.forEach((id) => {
          const el = map.get(id);
          if (el) list.appendChild(el);
        });
      });
    });

    sheet.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (removeCategoryPref(btn.dataset.del)) {
          btn.closest('.cat-manage-row')?.remove();
        }
      });
    });

    sheet.querySelectorAll('[data-add-name]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addUserCategory(btn.dataset.addName, btn.dataset.addEmoji, btn.dataset.addKind || 'suggested');
        close();
        openCategoryManageSheet();
      });
    });

    sheet.querySelector('[data-cat-custom-add]')?.addEventListener('click', () => {
      const input = sheet.querySelector('[data-cat-custom]');
      const name = input?.value?.trim();
      if (!name) return;
      addUserCategory(name, null, 'user');
      close();
      openCategoryManageSheet();
    });

    sheet.querySelector('[data-cat-refresh]')?.addEventListener('click', () => {
      refreshSuggested();
      close();
      openCategoryManageSheet();
    });
  }

  /** Wire long-press on a category bar to open manage sheet */
  function bindCategoryLongPress(bar) {
    if (!bar || bar.dataset.catLp === '1') return;
    bar.dataset.catLp = '1';
    let timer = null;
    const start = (e) => {
      const chip = e.target.closest?.('.akhbaar-cat-chip,[data-cat]');
      if (!chip || chip.dataset.cat === 'add') return;
      timer = setTimeout(() => {
        if (typeof Haptic !== 'undefined' && Haptic.tap) Haptic.tap();
        else if (navigator.vibrate) navigator.vibrate(12);
        openCategoryManageSheet();
      }, 480);
    };
    const clear = () => {
      clearTimeout(timer);
      timer = null;
    };
    bar.addEventListener('touchstart', start, { passive: true });
    bar.addEventListener('touchend', clear);
    bar.addEventListener('touchmove', clear);
    bar.addEventListener('mousedown', start);
    bar.addEventListener('mouseup', clear);
    bar.addEventListener('mouseleave', clear);
  }

  window.CategoryPrefs = {
    getOrderedCategories,
    touchCategory,
    addUserCategory,
    removeCategoryPref,
    reorderCategories,
    refreshSuggested,
    heuristicSuggestions,
    openCategoryManageSheet,
    bindCategoryLongPress,
    SUGGEST_TTL_MS,
    CORE_PINNED,
  };
})();
