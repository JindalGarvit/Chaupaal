/**
 * Inline music card + song picker (Baithak chat + Stories).
 * In-app only — HTML5 <audio>, never opens Spotify/JioSaavn/external apps.
 */
(function () {
  const SEARCH_DEBOUNCE_MS = 400;
  let sharedAudio = null;
  let activeCardEl = null;
  let resolveInFlight = new WeakMap();

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSharedAudio() {
    if (!sharedAudio) {
      sharedAudio = new Audio();
      sharedAudio.preload = 'none';
      sharedAudio.addEventListener('ended', () => syncActiveCard(false));
      sharedAudio.addEventListener('timeupdate', () => {
        if (!activeCardEl) return;
        const bar = activeCardEl.querySelector('[data-music-progress]');
        if (!bar || !sharedAudio.duration) return;
        const pct = Math.min(100, (sharedAudio.currentTime / sharedAudio.duration) * 100);
        bar.style.width = pct + '%';
      });
      sharedAudio.addEventListener('error', () => {
        if (activeCardEl) handlePreviewError(activeCardEl);
      });
    }
    return sharedAudio;
  }

  function syncActiveCard(playing) {
    document.querySelectorAll('.music-card.is-playing').forEach((el) => {
      if (!playing || el !== activeCardEl) {
        el.classList.remove('is-playing');
        const btn = el.querySelector('[data-music-play]');
        if (btn) {
          btn.setAttribute('aria-label', 'Play song');
          btn.innerHTML = playIcon();
        }
      }
    });
    if (playing && activeCardEl) {
      activeCardEl.classList.add('is-playing');
      const btn = activeCardEl.querySelector('[data-music-play]');
      if (btn) {
        btn.setAttribute('aria-label', 'Pause song');
        btn.innerHTML = pauseIcon();
      }
    }
  }

  function playIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
  }
  function pauseIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  }

  function pauseAllMusic() {
    try {
      const a = getSharedAudio();
      a.pause();
      a.removeAttribute('src');
      a.load();
    } catch (e) {}
    activeCardEl = null;
    syncActiveCard(false);
  }

  function normalizeMusic(m) {
    if (!m || typeof m !== 'object') return null;
    const title = String(m.title || '').trim();
    if (!title) return null;
    return {
      title,
      artist: String(m.artist || 'Unknown artist').trim(),
      thumbnail: String(m.thumbnail || '').trim(),
      previewUrl: m.previewUrl ? String(m.previewUrl).trim() : null,
      source: m.source || (m.previewUrl ? 'jiosaavn' : 'none'),
    };
  }

  /** HTML for an inline / overlay music card. */
  function renderMusicCard(music, opts) {
    const m = normalizeMusic(music);
    if (!m) return '';
    const playable = !!(m.previewUrl && m.source !== 'none');
    const variant = opts?.variant === 'story' ? 'story' : 'chat';
    const thumb = m.thumbnail
      ? `<img class="music-card-art" src="${esc(m.thumbnail)}" alt="" loading="lazy" decoding="async">`
      : `<div class="music-card-art music-card-art--empty" aria-hidden="true">♪</div>`;
    const controls = playable
      ? `<button type="button" class="music-card-play" data-music-play aria-label="Play song">${playIcon()}</button>
         <div class="music-card-progress-track" aria-hidden="true"><div class="music-card-progress-bar" data-music-progress></div></div>`
      : `<span class="music-card-unavailable">Preview not available</span>`;

    return `<div class="music-card music-card--${variant}${playable ? '' : ' music-card--static'}"
      data-music-card
      data-music-title="${esc(m.title)}"
      data-music-artist="${esc(m.artist)}"
      data-music-preview="${esc(m.previewUrl || '')}"
      data-music-source="${esc(m.source || 'none')}"
      data-music-thumb="${esc(m.thumbnail || '')}">
      ${thumb}
      <div class="music-card-meta">
        <div class="music-card-title">${esc(m.title)}</div>
        <div class="music-card-artist">${esc(m.artist)}</div>
        ${controls}
      </div>
    </div>`;
  }

  async function resolvePreview(card) {
    if (resolveInFlight.has(card)) return resolveInFlight.get(card);
    const title = card.dataset.musicTitle || '';
    const artist = card.dataset.musicArtist || '';
    const p = (async () => {
      if (typeof apiFetch !== 'function' || !title) return null;
      try {
        const envelope = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'music_resolve', title, artist },
        });
        if (!envelope?.ok) return null;
        return envelope.data || null;
      } catch {
        return null;
      }
    })();
    resolveInFlight.set(card, p);
    try {
      return await p;
    } finally {
      resolveInFlight.delete(card);
    }
  }

  async function handlePreviewError(card) {
    const resolved = await resolvePreview(card);
    if (resolved?.previewUrl) {
      card.dataset.musicPreview = resolved.previewUrl;
      card.dataset.musicSource = resolved.source || 'itunes';
      card.classList.remove('music-card--static');
      const unavail = card.querySelector('.music-card-unavailable');
      if (unavail) {
        unavail.outerHTML = `<button type="button" class="music-card-play" data-music-play aria-label="Play song">${playIcon()}</button>
          <div class="music-card-progress-track" aria-hidden="true"><div class="music-card-progress-bar" data-music-progress></div></div>`;
        bindCard(card);
      }
      return playCard(card);
    }
    // Static fallback — no play, no link-out
    pauseAllMusic();
    card.classList.add('music-card--static');
    card.dataset.musicPreview = '';
    card.dataset.musicSource = 'none';
    const play = card.querySelector('[data-music-play]');
    const track = card.querySelector('.music-card-progress-track');
    if (play) play.replaceWith(Object.assign(document.createElement('span'), { className: 'music-card-unavailable', textContent: 'Preview not available' }));
    track?.remove();
  }

  async function playCard(card) {
    const url = card.dataset.musicPreview || '';
    if (!url) {
      await handlePreviewError(card);
      return;
    }
    const audio = getSharedAudio();
    if (activeCardEl === card && !audio.paused) {
      audio.pause();
      syncActiveCard(false);
      return;
    }
    if (activeCardEl && activeCardEl !== card) {
      syncActiveCard(false);
    }
    activeCardEl = card;
    const bar = card.querySelector('[data-music-progress]');
    if (bar) bar.style.width = '0%';
    try {
      if (audio.src !== url) {
        audio.src = url;
      }
      await audio.play();
      syncActiveCard(true);
    } catch (e) {
      await handlePreviewError(card);
    }
  }

  function bindCard(card) {
    if (!card || card.dataset.musicBound === '1') return;
    card.dataset.musicBound = '1';
    card.querySelector('[data-music-play]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      playCard(card);
    });
  }

  function mountMusicCards(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-music-card]').forEach(bindCard);
  }

  async function searchSongs(query) {
    if (typeof apiFetch !== 'function') return [];
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'music_search', query, limit: 12 },
      });
      if (!envelope?.ok) return [];
      return Array.isArray(envelope.data?.results) ? envelope.data.results : [];
    } catch {
      return [];
    }
  }

  function skeletonRows(n) {
    return Array.from({ length: n }, () =>
      `<div class="music-picker-skel" aria-hidden="true">
        <div class="music-picker-skel-art"></div>
        <div class="music-picker-skel-lines"><div></div><div></div></div>
      </div>`
    ).join('');
  }

  /**
   * Bottom sheet song search. onSelect(music) when user taps a result.
   * Never throws — empty search shows inline "no results".
   */
  function openSongPicker({ onSelect, title } = {}) {
    const existing = document.querySelector('.music-picker-sheet');
    existing?.remove();

    const sheet = document.createElement('div');
    sheet.className = 'music-picker-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', title || 'Share a song');
    sheet.innerHTML = `
      <div class="music-picker-handle" aria-hidden="true"></div>
      <div class="music-picker-head">
        <div class="music-picker-title">${esc(title || 'Share a song')}</div>
        <button type="button" class="music-picker-close" data-music-picker-close aria-label="Close">✕</button>
      </div>
      <label class="music-picker-search-wrap">
        <span class="sr-only">Search songs</span>
        <input type="search" class="music-picker-input" placeholder="Song or artist…" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="music-picker-results" data-music-picker-results>
        <div class="music-picker-hint">Search for a song to share in-app</div>
      </div>`;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('is-open'));

    const input = sheet.querySelector('.music-picker-input');
    const resultsEl = sheet.querySelector('[data-music-picker-results]');
    let debounceTimer = null;
    let searchSeq = 0;

    const close = () => {
      clearTimeout(debounceTimer);
      sheet.classList.remove('is-open');
      setTimeout(() => sheet.remove(), 220);
    };

    sheet.querySelector('[data-music-picker-close]')?.addEventListener('click', close);
    if (typeof enableSwipeDismiss === 'function') {
      enableSwipeDismiss(sheet, close);
    }

    const renderResults = (list, emptyMsg) => {
      if (!list.length) {
        resultsEl.innerHTML = `<div class="music-picker-empty">${esc(emptyMsg || 'No results')}</div>`;
        return;
      }
      resultsEl.innerHTML = list
        .map((s, i) => {
          const art = s.thumbnail
            ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy">`
            : `<span aria-hidden="true">♪</span>`;
          return `<button type="button" class="music-picker-row" data-i="${i}">
            <div class="music-picker-row-art">${art}</div>
            <div class="music-picker-row-meta">
              <div class="music-picker-row-title">${esc(s.title)}</div>
              <div class="music-picker-row-artist">${esc(s.artist)}</div>
            </div>
          </button>`;
        })
        .join('');
      resultsEl.querySelectorAll('[data-i]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const song = list[Number(btn.dataset.i)];
          if (!song) return;
          const music = normalizeMusic(song) || {
            title: song.title,
            artist: song.artist || 'Unknown artist',
            thumbnail: song.thumbnail || '',
            previewUrl: song.previewUrl || null,
            source: song.previewUrl ? song.source || 'jiosaavn' : 'none',
          };
          if (!music.previewUrl) music.source = 'none';
          close();
          try {
            onSelect?.(music);
          } catch (e) {}
        });
      });
    };

    const runSearch = async (q) => {
      const seq = ++searchSeq;
      const query = q.trim();
      if (query.length < 1) {
        resultsEl.innerHTML = `<div class="music-picker-hint">Search for a song to share in-app</div>`;
        return;
      }
      resultsEl.innerHTML = skeletonRows(5);
      const list = await searchSongs(query);
      if (seq !== searchSeq) return;
      renderResults(list, 'No results');
    };

    input?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(input.value), SEARCH_DEBOUNCE_MS);
    });
    input?.focus();
  }

  // Pause when chat/story overlays dismiss or tab hides
  document.addEventListener('chaupaal:dismiss', () => pauseAllMusic());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAllMusic();
  });

  window.MusicCard = {
    render: renderMusicCard,
    mount: mountMusicCards,
    pauseAll: pauseAllMusic,
    openPicker: openSongPicker,
    normalize: normalizeMusic,
    search: searchSongs,
  };
  window.openSongPicker = openSongPicker;
  window.pauseAllMusic = pauseAllMusic;
  window.renderMusicCard = renderMusicCard;
  window.mountMusicCards = mountMusicCards;
})();
