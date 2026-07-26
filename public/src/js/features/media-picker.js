/**
 * Duniya GIF + Sticker pickers (first-session trust pass).
 *
 * GIF source order:
 * 1) Tenor v2 search when a key is present (meta[name="chaupaal-tenor-key"] or
 *    window.CHAUPAAL_TENOR_KEY). Replace the demo/empty key in production.
 * 2) LOCAL_GIF_PACK — curated public CDN URLs (no key required).
 *
 * Stickers: fixed local emoji pack (no network).
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

  function resolveTenorKey() {
    if (typeof window.CHAUPAAL_TENOR_KEY === 'string' && window.CHAUPAAL_TENOR_KEY.trim()) {
      return window.CHAUPAAL_TENOR_KEY.trim();
    }
    try {
      const meta = document.querySelector('meta[name="chaupaal-tenor-key"]');
      const v = meta?.getAttribute('content');
      if (v && v.trim() && v.trim() !== 'REPLACE_ME') return v.trim();
    } catch (e) {}
    return '';
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

  async function fetchTenorGifs(query) {
    const key = resolveTenorKey();
    if (!key) return null;
    const q = encodeURIComponent(query || 'hello');
    const url = `https://tenor.googleapis.com/v2/search?q=${q}&key=${encodeURIComponent(key)}&limit=24&media_filter=gif,tinygif&client_key=chaupaal_web`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Tenor ' + res.status);
    const data = await res.json();
    return (data.results || [])
      .map((r) => {
        const media = r.media_formats || {};
        const gif = media.gif || media.tinygif || media.nanogif;
        if (!gif?.url) return null;
        return { id: r.id, title: r.content_description || 'GIF', url: gif.url, preview: media.tinygif?.url || gif.url };
      })
      .filter(Boolean);
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
        caption.placeholder = 'Add a caption for your GIF…';
      }
    }
  }

  function openGifPicker() {
    openPickerSheet({
      title: 'Pick a GIF',
      bodyHtml: `
        <div class="media-picker-search-row">
          <input type="search" id="gifSearchInput" placeholder="Search GIFs…" autocomplete="off">
        </div>
        <div class="media-picker-hint" id="gifSourceHint"></div>
        <div class="media-picker-grid" id="gifGrid"></div>`,
      onMount(sheet, close) {
        const grid = sheet.querySelector('#gifGrid');
        const hint = sheet.querySelector('#gifSourceHint');
        const input = sheet.querySelector('#gifSearchInput');
        const key = resolveTenorKey();
        hint.textContent = key
          ? 'Powered by Tenor'
          : 'Local pack — set meta chaupaal-tenor-key for live Tenor search';

        function paint(items) {
          grid.innerHTML = (items || [])
            .map(
              (g) =>
                `<button type="button" class="media-picker-cell" data-gif-url="${g.url}" data-gif-title="${(g.title || 'GIF').replace(/"/g, '&quot;')}" title="${g.title || 'GIF'}">
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

        async function run(q) {
          grid.innerHTML = '<div class="media-picker-loading">Loading…</div>';
          try {
            const remote = await fetchTenorGifs(q || 'hello');
            if (remote && remote.length) {
              paint(remote);
              return;
            }
          } catch (e) {
            console.warn('[gif] Tenor unavailable — using local pack', e?.message || e);
          }
          const ql = String(q || '').toLowerCase();
          const local = ql
            ? LOCAL_GIF_PACK.filter((g) => g.title.toLowerCase().includes(ql) || g.id.includes(ql))
            : LOCAL_GIF_PACK;
          paint(local.length ? local : LOCAL_GIF_PACK);
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
      title: 'Stickers',
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
