/**
 * Klipy media picker — GIFs, Stickers, Memes, Clips.
 *
 * Source order (graceful degradation):
 * 1) Live Klipy via POST /api/media-config { action: 'gif_search', kind }
 *    when feature flag `gif_live_search` is on and server reports configured.
 * 2) Server cached/trending results (same action).
 * 3) LOCAL_GIF_PACK (GIFs) / STICKER_PACK emoji (stickers) — last resort.
 *
 * CDN URLs only — never re-host bytes. Key stays server-side.
 */
(function () {
  'use strict';

  const LOCAL_GIF_PACK = [
    { id: 'wave', title: 'Wave', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', kind: 'gif' },
    { id: 'clap', title: 'Clap', url: 'https://media.giphy.com/media/7rj2ZgrrXavTEqIZyH/giphy.gif', kind: 'gif' },
    { id: 'laugh', title: 'Laugh', url: 'https://media.giphy.com/media/10JhviFuU2bUxG/giphy.gif', kind: 'gif' },
    { id: 'wow', title: 'Wow', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', kind: 'gif' },
    { id: 'heart', title: 'Heart', url: 'https://media.giphy.com/media/l0MYt5jPR19BpObFV/giphy.gif', kind: 'gif' },
    { id: 'thumbs', title: 'Thumbs up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', kind: 'gif' },
    { id: 'dance', title: 'Dance', url: 'https://media.giphy.com/media/l0MYt5jPR19BpObFV/giphy.gif', kind: 'gif' },
    { id: 'tea', title: 'Chai', url: 'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif', kind: 'gif' },
  ];

  const STICKER_PACK = [
    '🏠', '🔥', '✨', '❤️', '😂', '🙏', '☕', '🏏',
    '🎵', '🌳', '📰', '🎯', '💪', '🌟', '🙌', '😎',
    '🥳', '💬', '🏆', '🌸', '☀️', '🌧️', '🌙', '🚀',
  ];

  const KINDS = ['gif', 'sticker', 'meme', 'clip'];

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function openPickerSheet({ title, bodyHtml, onMount }) {
    const existing = document.getElementById('mediaPickerSheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'mediaPickerSheet';
    sheet.className = 'media-picker-sheet';
    sheet.innerHTML = `
      <div class="media-picker-header">
        <div class="media-picker-title">${title}</div>
        <button type="button" class="media-picker-close" aria-label="Close">✕</button>
      </div>
      <div class="media-picker-body">${bodyHtml}</div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    sheet.querySelector('.media-picker-close')?.addEventListener('click', close);
    if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }
    onMount?.(sheet, close);
    return sheet;
  }

  function filterLocalPack(q) {
    const ql = String(q || '').toLowerCase().trim();
    if (!ql) return LOCAL_GIF_PACK.slice();
    const filtered = LOCAL_GIF_PACK.filter(
      (g) => g.title.toLowerCase().includes(ql) || g.id.includes(ql)
    );
    return filtered.length ? filtered : LOCAL_GIF_PACK.slice();
  }

  function normalizeKind(raw) {
    const k = String(raw || 'gif').toLowerCase();
    return KINDS.includes(k) ? k : 'gif';
  }

  /**
   * @returns {Promise<{ items: object[], source: string, configured: boolean, kind: string }|null>}
   */
  async function fetchServerKlipy(kind, query) {
    if (typeof isFeatureEnabled === 'function') {
      const live = await isFeatureEnabled('gif_live_search', { defaultValue: true });
      if (!live) return null;
    } else {
      return null;
    }
    if (typeof apiFetch !== 'function') return null;
    const k = normalizeKind(kind);
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'gif_search', kind: k, query: query || '', limit: 24 },
      });
      if (!envelope?.ok) return { items: [], source: 'error', configured: false, kind: k };
      const data = envelope.data || {};
      const items = Array.isArray(data.results)
        ? data.results
            .map((r) => ({
              id: r.id,
              title: r.title || k,
              kind: r.kind || k,
              url: r.url,
              preview: r.previewUrl || r.url,
              previewUrl: r.previewUrl || r.url,
              width: r.width,
              height: r.height,
              mime: r.mime || '',
              duration: r.duration || null,
            }))
            .filter((r) => r.url)
        : [];
      return {
        items,
        source: String(data.source || ''),
        configured: data.configured !== false,
        kind: k,
      };
    } catch (e) {
      console.warn('[klipy] server search unavailable', e?.message || e);
      return { items: [], source: 'error', configured: false, kind: k };
    }
  }

  function insertIntoComposer(payload) {
    const caption = document.getElementById('duniyaCaptionInput');
    const preview = document.getElementById('duniyaMediaPreview');
    if (payload.type === 'sticker' && payload.emoji) {
      if (caption) {
        const start = caption.selectionStart ?? caption.value.length;
        const end = caption.selectionEnd ?? start;
        const before = caption.value.slice(0, start);
        const after = caption.value.slice(end);
        caption.value = before + payload.emoji + after;
        caption.focus();
        const pos = start + payload.emoji.length;
        try {
          caption.setSelectionRange(pos, pos);
        } catch (e) {}
      }
      return;
    }
    const mediaTypes = ['gif', 'sticker', 'meme', 'clip'];
    if (mediaTypes.includes(payload.type) && payload.url && preview) {
      window.__duniyaPendingGif = {
        url: payload.url,
        title: payload.title || payload.type,
        kind: payload.type,
        preview: payload.preview || payload.url,
      };
      const isClip = payload.type === 'clip';
      preview.innerHTML = isClip
        ? `<div class="duniya-gif-preview duniya-clip-preview"><video src="${escAttr(payload.url)}" poster="${escAttr(payload.preview || '')}" muted playsinline controls preload="metadata"></video><button type="button" class="duniya-gif-clear" aria-label="Remove">✕</button></div>`
        : `<div class="duniya-gif-preview"><img src="${escAttr(payload.url)}" alt="${escAttr(payload.title || '')}"><button type="button" class="duniya-gif-clear" aria-label="Remove">✕</button></div>`;
      preview.querySelector('.duniya-gif-clear')?.addEventListener('click', () => {
        window.__duniyaPendingGif = null;
        preview.innerHTML = '';
      });
      if (caption && !caption.value.trim()) {
        caption.placeholder = tt('gif_caption_placeholder', 'Add a caption…');
      }
    }
  }

  function tabLabel(kind) {
    if (kind === 'gif') return tt('klipy_tab_gif', 'GIFs');
    if (kind === 'sticker') return tt('klipy_tab_stickers', 'Stickers');
    if (kind === 'meme') return tt('klipy_tab_memes', 'Memes');
    if (kind === 'clip') return tt('klipy_tab_clips', 'Clips');
    return kind;
  }

  function searchPlaceholder(kind) {
    if (kind === 'gif') return tt('gif_search_placeholder', 'Search GIFs…');
    if (kind === 'sticker') return tt('klipy_search_stickers', 'Search stickers…');
    if (kind === 'meme') return tt('klipy_search_memes', 'Search memes…');
    if (kind === 'clip') return tt('klipy_search_clips', 'Search clips…');
    return tt('gif_search_placeholder', 'Search…');
  }

  function formatDuration(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 60) return `${Math.round(n)}s`;
    return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
  }

  /**
   * Tabbed Klipy sheet. opts.kind opens that tab (default gif).
   * onSelect receives { type, kind, url, preview, title, mime?, duration?, emoji? }.
   */
  function openKlipyMediaPicker(opts) {
    const o = opts || {};
    const onSelect = typeof o.onSelect === 'function' ? o.onSelect : null;
    let activeKind = normalizeKind(o.kind || 'gif');

    openPickerSheet({
      title: tt('klipy_picker_title', 'GIF & more'),
      bodyHtml: `
        <div class="media-picker-tabs" role="tablist">
          ${KINDS.map(
            (k) =>
              `<button type="button" class="media-picker-tab${k === activeKind ? ' is-active' : ''}" role="tab" data-kind="${k}" aria-selected="${k === activeKind}">${tabLabel(k)}</button>`
          ).join('')}
        </div>
        <div class="media-picker-search-row">
          <input type="search" id="klipySearchInput" placeholder="${escAttr(searchPlaceholder(activeKind))}" autocomplete="off">
        </div>
        <div class="media-picker-hint" id="klipySourceHint"></div>
        <div class="media-picker-grid" id="klipyGrid"></div>
        <div class="media-picker-emoji-fallback hidden" id="klipyEmojiFallback">
          <div class="media-picker-hint">${tt('klipy_emoji_fallback', 'Emoji stickers')}</div>
          <div class="media-picker-sticker-grid" id="klipyEmojiGrid"></div>
        </div>`,
      onMount(sheet, close) {
        const grid = sheet.querySelector('#klipyGrid');
        const hint = sheet.querySelector('#klipySourceHint');
        const input = sheet.querySelector('#klipySearchInput');
        const emojiWrap = sheet.querySelector('#klipyEmojiFallback');
        const emojiGrid = sheet.querySelector('#klipyEmojiGrid');

        function emitSelect(item) {
          const payload = {
            type: item.type || item.kind || activeKind,
            kind: item.kind || item.type || activeKind,
            url: item.url || '',
            preview: item.preview || item.previewUrl || item.url || '',
            title: item.title || '',
            mime: item.mime || '',
            duration: item.duration || null,
            emoji: item.emoji || '',
          };
          if (onSelect) onSelect(payload);
          else insertIntoComposer(payload);
          close();
        }

        function paintEmojiFallback() {
          if (!emojiWrap || !emojiGrid) return;
          emojiWrap.classList.remove('hidden');
          emojiGrid.innerHTML = STICKER_PACK.map(
            (emoji) =>
              `<button type="button" class="media-picker-sticker" data-sticker="${emoji}" aria-label="Sticker ${emoji}">${emoji}</button>`
          ).join('');
          emojiGrid.querySelectorAll('[data-sticker]').forEach((btn) => {
            btn.addEventListener('click', () => {
              emitSelect({ type: 'sticker', kind: 'sticker', emoji: btn.dataset.sticker });
            });
          });
        }

        function hideEmojiFallback() {
          emojiWrap?.classList.add('hidden');
        }

        function paintCells(items) {
          hideEmojiFallback();
          if (!items || !items.length) {
            grid.innerHTML = `<div class="media-picker-empty cp-state">${tt('klipy_empty', 'Nothing here yet — try another word')}</div>`;
            if (activeKind === 'sticker') paintEmojiFallback();
            return;
          }
          grid.innerHTML = items
            .map((g) => {
              const kind = g.kind || activeKind;
              const preview = g.preview || g.previewUrl || g.url;
              const dur = kind === 'clip' ? formatDuration(g.duration) : '';
              if (kind === 'clip') {
                return `<button type="button" class="media-picker-cell media-picker-cell--clip" data-url="${escAttr(g.url)}" data-preview="${escAttr(preview)}" data-title="${escAttr(g.title || 'Clip')}" data-kind="clip" data-mime="${escAttr(g.mime || '')}" data-duration="${escAttr(g.duration || '')}" title="${escAttr(g.title || 'Clip')}">
                  <img src="${escAttr(preview)}" alt="" loading="lazy">
                  ${dur ? `<span class="media-picker-clip-dur">${dur}</span>` : '<span class="media-picker-clip-dur">▶</span>'}
                </button>`;
              }
              return `<button type="button" class="media-picker-cell" data-url="${escAttr(g.url)}" data-preview="${escAttr(preview)}" data-title="${escAttr(g.title || kind)}" data-kind="${escAttr(kind)}" data-mime="${escAttr(g.mime || '')}" title="${escAttr(g.title || kind)}">
                <img src="${escAttr(preview)}" alt="${escAttr(g.title || kind)}" loading="lazy">
              </button>`;
            })
            .join('');
          grid.querySelectorAll('[data-url]').forEach((btn) => {
            btn.addEventListener('click', () => {
              emitSelect({
                type: btn.dataset.kind || activeKind,
                kind: btn.dataset.kind || activeKind,
                url: btn.dataset.url,
                preview: btn.dataset.preview || btn.dataset.url,
                title: btn.dataset.title,
                mime: btn.dataset.mime || '',
                duration: btn.dataset.duration ? Number(btn.dataset.duration) : null,
              });
            });
          });
        }

        function paintLocalGif(q) {
          hint.textContent = tt('gif_hint_local', 'Curated pack');
          paintCells(filterLocalPack(q));
        }

        async function run(q) {
          if (typeof renderSkeleton === 'function') renderSkeleton(grid, { variant: 'card', count: 6 });
          else grid.innerHTML = `<div class="media-picker-loading cp-state" role="status">${tt('gif_loading', 'Loading…')}</div>`;
          hideEmojiFallback();

          const remote = await fetchServerKlipy(activeKind, q);
          if (!remote) {
            if (activeKind === 'gif') paintLocalGif(q);
            else if (activeKind === 'sticker') {
              hint.textContent = tt('klipy_emoji_fallback', 'Emoji stickers');
              grid.innerHTML = '';
              paintEmojiFallback();
            } else {
              hint.textContent = tt('klipy_offline', 'Live search is off');
              grid.innerHTML = `<div class="media-picker-empty cp-state">${tt('klipy_empty_offline', 'Turn on live media search to browse this tab')}</div>`;
            }
            return;
          }

          if (remote.items && remote.items.length) {
            if (remote.source === 'trending' || (!q && remote.source !== 'klipy')) {
              hint.textContent = tt('gif_hint_trending', 'Trending');
            } else if (remote.source === 'cache') {
              hint.textContent = tt('gif_hint_results', 'Results');
            } else if (remote.configured) {
              hint.textContent = tt('gif_hint_klipy', 'Powered by KLIPY');
            } else {
              hint.textContent = tt('gif_hint_local', 'Curated pack');
            }
            paintCells(remote.items);
            if (activeKind === 'sticker') {
              // Keep emoji as a small secondary row under live stickers
              paintEmojiFallback();
            }
            return;
          }

          if (activeKind === 'gif') paintLocalGif(q);
          else if (activeKind === 'sticker') {
            hint.textContent = tt('klipy_emoji_fallback', 'Emoji stickers');
            grid.innerHTML = '';
            paintEmojiFallback();
          } else {
            hint.textContent = '';
            paintCells([]);
          }
        }

        sheet.querySelectorAll('.media-picker-tab').forEach((tab) => {
          tab.addEventListener('click', () => {
            activeKind = normalizeKind(tab.dataset.kind);
            sheet.querySelectorAll('.media-picker-tab').forEach((tEl) => {
              const on = tEl.dataset.kind === activeKind;
              tEl.classList.toggle('is-active', on);
              tEl.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            if (input) {
              input.placeholder = searchPlaceholder(activeKind);
              input.value = '';
            }
            run('');
          });
        });

        let timer = null;
        input?.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => run(input.value.trim()), 320);
        });
        if (typeof enhanceSearchField === 'function' && input) {
          enhanceSearchField(input, {
            surfaceId: 'klipy',
            onClear() {
              clearTimeout(timer);
              run('');
            },
          });
        }
        run('');
        setTimeout(() => input?.focus(), 80);
      },
    });
  }

  function openGifPicker(opts) {
    openKlipyMediaPicker(Object.assign({}, opts, { kind: (opts && opts.kind) || 'gif' }));
  }

  function openStickerPicker(opts) {
    const onSelect = opts && typeof opts.onSelect === 'function' ? opts.onSelect : null;
    openKlipyMediaPicker({
      kind: 'sticker',
      onSelect(item) {
        if (!onSelect) {
          insertIntoComposer(item);
          return;
        }
        // Legacy callers expect a raw emoji string for local stickers
        if (item.emoji && !item.url) onSelect(item.emoji);
        else onSelect(item);
      },
    });
  }

  window.openGifPicker = openGifPicker;
  window.openStickerPicker = openStickerPicker;
  window.openKlipyMediaPicker = openKlipyMediaPicker;
  window.LOCAL_GIF_PACK = LOCAL_GIF_PACK;
  window.STICKER_PACK = STICKER_PACK;
})();
