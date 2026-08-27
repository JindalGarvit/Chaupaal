/**
 * Shared search-field UX: ✕ clear (only when non-empty) + surface reset bus.
 */
(function () {
  'use strict';

  const registry = new Map(); // surfaceId -> Set of controllers

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function ensureWrap(input) {
    let wrap = input.closest(
      '.search-field, .baithak-search-wrap, .share-search-wrap, .us-search-wrap, .search-field-wrap, .khoj-search-wrap'
    );
    if (wrap) {
      wrap.classList.add('search-field');
      return wrap;
    }
    wrap = document.createElement('div');
    wrap.className = 'search-field search-field-wrap';
    const parent = input.parentNode;
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    return wrap;
  }

  function ensureClearBtn(wrap, existing) {
    if (existing && existing.isConnected) {
      existing.classList.add('search-field-clear');
      return existing;
    }
    let btn = wrap.querySelector('.search-field-clear');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-field-clear';
    btn.setAttribute('aria-label', tt('search_clear', 'Clear search'));
    btn.hidden = true;
    btn.textContent = '✕';
    // Prefer left of existing search icon
    const icon = wrap.querySelector(
      '.baithak-search-icon-btn, .share-search-ico, [data-search-icon], .search-field-icon'
    );
    if (icon) wrap.insertBefore(btn, icon);
    else wrap.appendChild(btn);
    return btn;
  }

  function syncClear(input, clearBtn) {
    const has = !!(input?.value || '').trim();
    if (!clearBtn) return;
    clearBtn.hidden = !has;
    clearBtn.setAttribute('aria-hidden', has ? 'false' : 'true');
  }

  /**
   * @returns {{ clear: Function, destroy: Function, surfaceId: string }}
   */
  function enhanceSearchField(inputEl, opts) {
    const o = opts || {};
    if (!inputEl || inputEl.dataset.searchFieldWired === '1') {
      return registry.get(o.surfaceId)?.values?.()?.next?.()?.value || null;
    }
    inputEl.dataset.searchFieldWired = '1';
    inputEl.classList.add('search-field-input');
    if (inputEl.type === 'search') inputEl.classList.add('search-field-hide-native-clear');

    const wrap = ensureWrap(inputEl);
    wrap.classList.add('search-field');
    const clearBtn = ensureClearBtn(wrap, o.clearBtn || null);
    clearBtn.setAttribute('aria-label', tt('search_clear', 'Clear search'));

    const surfaceId = o.surfaceId || 'global';
    const controller = {
      surfaceId,
      input: inputEl,
      clearBtn,
      clear(silent) {
        inputEl.value = '';
        syncClear(inputEl, clearBtn);
        if (!silent && typeof o.onClear === 'function') {
          try {
            o.onClear();
          } catch (e) {}
        }
      },
      destroy() {
        const set = registry.get(surfaceId);
        set?.delete(controller);
        if (set && set.size === 0) registry.delete(surfaceId);
      },
    };

    if (!registry.has(surfaceId)) registry.set(surfaceId, new Set());
    registry.get(surfaceId).add(controller);

    const onInput = () => {
      syncClear(inputEl, clearBtn);
      if (typeof o.onQuery === 'function') {
        try {
          o.onQuery(inputEl.value);
        } catch (e) {}
      }
    };
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keyup', () => syncClear(inputEl, clearBtn));
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      controller.clear(false);
      inputEl.focus();
    });
    syncClear(inputEl, clearBtn);

    return controller;
  }

  function resetSurface(surfaceId) {
    const set = registry.get(surfaceId);
    if (!set) return;
    set.forEach((c) => {
      try {
        c.clear(false);
      } catch (e) {}
    });
  }

  function resetAllExcept(keepId) {
    registry.forEach((set, id) => {
      if (keepId && id === keepId) return;
      set.forEach((c) => {
        try {
          c.clear(false);
        } catch (e) {}
      });
    });
  }

  function resetAll() {
    resetAllExcept(null);
  }

  /**
   * Inline filter for fixed people lists (Friends, viewers, send-to).
   * Does not open universal search.
   * @param {{
   *   host: Element,
   *   placeholder?: string,
   *   surfaceId?: string,
   *   getRows: () => Element[],
   *   match?: (row: Element, q: string) => boolean,
   *   emptyEl?: Element|null,
   * }} opts
   */
  function mountListFilter(opts) {
    const o = opts || {};
    const host = o.host;
    if (!host) return null;
    let bar = host.querySelector('[data-list-filter]');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'list-filter-bar search-field';
      bar.setAttribute('data-list-filter', '1');
      bar.innerHTML = `<input type="search" class="search-field-input list-filter-input" data-list-filter-input placeholder="${String(
        o.placeholder || 'Search…'
      ).replace(/"/g, '&quot;')}" autocomplete="off" enterkeyhint="search">`;
      host.insertBefore(bar, host.firstChild);
    }
    const input = bar.querySelector('[data-list-filter-input]');
    if (!input) return null;

    const defaultMatch = (row, q) => {
      const hay = (
        row.getAttribute('data-filter-text') ||
        row.textContent ||
        ''
      ).toLowerCase();
      return hay.includes(q);
    };
    const matchFn = typeof o.match === 'function' ? o.match : defaultMatch;

    const apply = () => {
      const q = String(input.value || '')
        .trim()
        .toLowerCase();
      const rows = typeof o.getRows === 'function' ? o.getRows() : [];
      let shown = 0;
      rows.forEach((row) => {
        if (!row) return;
        const ok = !q || matchFn(row, q);
        row.hidden = !ok;
        if (ok) shown += 1;
      });
      const empty = o.emptyEl || host.querySelector('[data-list-filter-empty]');
      if (empty) empty.hidden = shown > 0 || !q;
    };

    enhanceSearchField(input, {
      surfaceId: o.surfaceId || 'list_filter',
      onClear: apply,
      onQuery: apply,
    });
    input.addEventListener('input', apply);
    apply();
    return { apply, input, destroy: () => {} };
  }

  window.SearchFields = {
    enhance: enhanceSearchField,
    enhanceSearchField,
    resetSurface,
    resetAll,
    resetAllExcept,
    mountListFilter,
  };
  window.enhanceSearchField = enhanceSearchField;
  window.mountListFilter = mountListFilter;
})();
