/**
 * Duniya GIF + Sticker pickers.
 *
 * GIF source order (graceful degradation, no user-facing errors unless empty):
 * 1) Live Klipy via POST /api/media-config { action: 'gif_search' }
 *    when feature flag `gif_live_search` is on and server reports configured.
 * 2) Server cached/trending results (same action, source: trending|cache).
 * 3) LOCAL_GIF_PACK — curated Giphy CDN URLs (always available).
 *
 * Stickers: fixed local emoji pack (no network). GIF bytes are never re-hosted —
 * attachments store the CDN URL only (same pattern as music).
 */
(function () {
  'use strict';

  /**
   * Curated public GIF pack — swap URLs anytime. Prefer hosting your own later.
   * These are well-known Giphy media CDN paths (https allowed by CSP img-src).
   */
  const LOCAL_GIF_PACK = [
    { id: 'wave', title: 'Wave', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },
    { id: 'clap', title: 'Clap', url: 'https://media.giphy.com/media/7rj2ZgrrXavTEqIZyH/giphy.gif' },
    { id: 'laugh', title: 'Laugh', url: 'https://media.giphy.com/media/10JhviFuU2bUxG/giphy.gif' },
    { id: 'wow', title: 'Wow', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
    { id: 'heart', title: 'Heart', url: 'https://media.giphy.com/media/l0MYt5jPR19BpObFV/giphy.gif' },
    { id: 'thumbs', title: 'Thumbs up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
    { id: 'dance', title: 'Dance', url: 'https://media.giphy.com/media/l0MYt5jPR19BpObFV/giphy.gif' },
    { id: 'tea', title: 'Chai', url: 'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif' },
  ];

  const STICKER_PACK = [
    '🏠', '🔥', '✨', '❤️', '😂', '🙏', '☕', '🏏',
    '🎵', '🌳', '📰', '🎯', '💪', '🌟', '🙌', '😎',
    '🥳', '💬', '🏆', '🌸', '☀️', '🌧️', '🌙', '🚀',
  ];

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
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

  /**
   * Server GIF search. Returns null when live path should not run / is unavailable.
   * @returns {Promise<{ items: object[], source: string, configured: boolean }|null>}
   */
  async function fetchServerGifs(query) {
    if (typeof isFeatureEnabled === 'function') {
      const live = await isFeatureEnabled('gif_live_search', { defaultValue: false });
      if (!live) return null;
    } else {
      return null;
    }
    if (typeof apiFetch !== 'function') return null;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'gif_search', query: query || '', limit: 24 },
      });
      if (!envelope?.ok) return { items: [], source: 'error', configured: false };
      const data = envelope.data || {};
      const items = Array.isArray(data.results)
        ? data.results.map((r) => ({
            id: r.id,
            title: r.title || 'GIF',
            url: r.url,
            preview: r.previewUrl || r.url,
            width: r.width,
            height: r.height,
          }))
        : [];
      return {
        items,
        source: String(data.source || ''),
        configured: data.configured !== false,
      };
    } catch (e) {
      console.warn('[gif] server search unavailable', e?.message || e);
      return { items: [], source: 'error', configured: false };
    }
  }

  function insertIntoComposer(payload) {
    const caption = document.getElementById('duniyaCaptionInput');
    const preview = document.getElementById('duniyaMediaPreview');
    if (payload.type === 'sticker') {
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
    if (payload.type === 'gif' && preview) {
      window.__duniyaPendingGif = { url: payload.url, title: payload.title || 'GIF' };
      preview.innerHTML = `<div class="duniya-gif-preview"><img src="${payload.url}" alt="${payload.title || 'GIF'}"><button type="button" class="duniya-gif-clear" aria-label="Remove GIF">✕</button></div>`;
      preview.querySelector('.duniya-gif-clear')?.addEventListener('click', () => {
        window.__duniyaPendingGif = null;
        preview.innerHTML = '';
      });
      if (caption && !caption.value.trim()) {
        caption.placeholder = tt('gif_caption_placeholder', 'Add a caption for your GIF…');
      }
    }
  }

  function openGifPicker() {
    openPickerSheet({
      title: tt('gif_picker_title', 'Pick a GIF'),
      bodyHtml: `
        <div class="media-picker-search-row">
          <input type="search" id="gifSearchInput" placeholder="${tt('gif_search_placeholder', 'Search GIFs…')}" autocomplete="off">
        </div>
        <div class="media-picker-hint" id="gifSourceHint"></div>
        <div class="media-picker-grid" id="gifGrid"></div>`,
      onMount(sheet, close) {
        const grid = sheet.querySelector('#gifGrid');
        const hint = sheet.querySelector('#gifSourceHint');
        const input = sheet.querySelector('#gifSearchInput');

        function paint(items) {
          grid.innerHTML = (items || [])
            .map(
              (g) =>
                `<button type="button" class="media-picker-cell" data-gif-url="${g.url}" data-gif-title="${String(g.title || 'GIF').replace(/"/g, '&quot;')}" title="${g.title || 'GIF'}">
                  <img src="${g.preview || g.url}" alt="${g.title || 'GIF'}" loading="lazy">
                </button>`
            )
            .join('');
          grid.querySelectorAll('[data-gif-url]').forEach((btn) => {
            btn.addEventListener('click', () => {
              insertIntoComposer({ type: 'gif', url: btn.dataset.gifUrl, title: btn.dataset.gifTitle });
              close();
            });
          });
        }

        function paintLocal(q) {
          hint.textContent = tt('gif_hint_local', 'Curated pack');
          paint(filterLocalPack(q));
        }

        async function run(q) {
          grid.innerHTML = `<div class="media-picker-loading cp-state" role="status">${tt('gif_loading', 'Loading…')}</div>`;
          const remote = await fetchServerGifs(q);
          if (!remote) {
            paintLocal(q);
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
            paint(remote.items);
            return;
          }
          // Unconfigured / empty / error → local pack (never break the picker)
          paintLocal(q);
        }

        let timer = null;
        input?.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => run(input.value.trim()), 320);
        });
        run('');
        setTimeout(() => input?.focus(), 80);
      },
    });
  }

  function openStickerPicker() {
    openPickerSheet({
      title: tt('sticker_picker_title', 'Stickers'),
      bodyHtml: `<div class="media-picker-sticker-grid" id="stickerGrid"></div>`,
      onMount(sheet, close) {
        const grid = sheet.querySelector('#stickerGrid');
        grid.innerHTML = STICKER_PACK.map(
          (emoji) =>
            `<button type="button" class="media-picker-sticker" data-sticker="${emoji}" aria-label="Sticker ${emoji}">${emoji}</button>`
        ).join('');
        grid.querySelectorAll('[data-sticker]').forEach((btn) => {
          btn.addEventListener('click', () => {
            insertIntoComposer({ type: 'sticker', emoji: btn.dataset.sticker });
            close();
          });
        });
      },
    });
  }

  window.openGifPicker = openGifPicker;
  window.openStickerPicker = openStickerPicker;
  window.LOCAL_GIF_PACK = LOCAL_GIF_PACK;
  window.STICKER_PACK = STICKER_PACK;
})();
