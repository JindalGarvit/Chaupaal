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
    let wrap = input.closest('.search-field, .baithak-search-wrap, .share-search-wrap, .us-search-wrap, .search-field-wrap');
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

  window.SearchFields = {
    enhance: enhanceSearchField,
    enhanceSearchField,
    resetSurface,
    resetAll,
    resetAllExcept,
  };
  window.enhanceSearchField = enhanceSearchField;
})();
