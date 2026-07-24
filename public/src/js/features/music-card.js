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
      sharedAudio.preload = 'auto';
      sharedAudio.setAttribute('playsinline', '');
      sharedAudio.setAttribute('webkit-playsinline', '');
      // Keep element in DOM — some mobile WebViews won't decode detached Audio nodes
      try {
        sharedAudio.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none;left:-9999px;';
        (document.querySelector('.device') || document.body).appendChild(sharedAudio);
      } catch (e) {}
      window.__chaupaalSharedAudio = sharedAudio;
      sharedAudio.addEventListener('ended', () => syncActiveCard(false));
      sharedAudio.addEventListener('timeupdate', () => {
        if (!activeCardEl) return;
        const bar = activeCardEl.querySelector('[data-music-progress]');
        if (bar && sharedAudio.duration) {
          const pct = Math.min(100, (sharedAudio.currentTime / sharedAudio.duration) * 100);
          bar.style.width = pct + '%';
        }
        if (typeof syncMiniPlayer === 'function') syncMiniPlayer(sharedAudio);
      });
      sharedAudio.addEventListener('error', () => {
        if (!activeCardEl) return;
        const code = sharedAudio.error?.code;
        // MEDIA_ERR_ABORTED (1) fires when we intentionally change src — ignore
        if (code === 1) return;
        const expected = activeCardEl.dataset.musicPreview || '';
        const failed = sharedAudio.currentSrc || sharedAudio.src || '';
        if (expected && failed && failed.indexOf(expected.slice(0, 48)) === -1 && expected.indexOf(failed.slice(0, 48)) === -1) {
          return;
        }
        handlePreviewError(activeCardEl, { fromUserGesture: false });
      });
      sharedAudio.addEventListener('play', () => {
        if (activeCardEl) {
          sharedAudio.dataset.cpTitle = activeCardEl.dataset.musicTitle || '';
          sharedAudio.dataset.cpArtist = activeCardEl.dataset.musicArtist || '';
        }
        if (typeof syncMiniPlayer === 'function') syncMiniPlayer(sharedAudio);
      });
    }
    window.__chaupaalSharedAudio = sharedAudio;
    return sharedAudio;
  }

  function ensureCardMediaControls(card) {
    const host = card.querySelector('[data-music-extra-controls]');
    if (!host || host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    if (typeof bindMediaControls === 'function') {
      bindMediaControls(getSharedAudio(), host);
    }
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
         <div class="music-card-progress-track" aria-hidden="true"><div class="music-card-progress-bar" data-music-progress></div></div>
         <div data-music-extra-controls></div>`
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

  function markPreviewReady(card, resolved) {
    if (!resolved?.previewUrl || !card) return;
    card.dataset.musicPreview = resolved.previewUrl;
    card.dataset.musicSource = resolved.source || 'itunes';
    card.classList.remove('music-card--static');
    const unavail = card.querySelector('.music-card-unavailable');
    if (unavail) {
      unavail.outerHTML = `<button type="button" class="music-card-play" data-music-play aria-label="Play song">${playIcon()}</button>
        <div class="music-card-progress-track" aria-hidden="true"><div class="music-card-progress-bar" data-music-progress></div></div>
        <div data-music-extra-controls></div>`;
      card.dataset.musicBound = '0';
      bindCard(card);
    }
  }

  function markPreviewUnavailable(card) {
    pauseAllMusic();
    card.classList.add('music-card--static');
    card.dataset.musicPreview = '';
    card.dataset.musicSource = 'none';
    const play = card.querySelector('[data-music-play]');
    const track = card.querySelector('.music-card-progress-track');
    const extra = card.querySelector('[data-music-extra-controls]');
    if (play) {
      play.replaceWith(
        Object.assign(document.createElement('span'), {
          className: 'music-card-unavailable',
          textContent: 'Preview not available',
        })
      );
    }
    track?.remove();
    extra?.remove();
  }

  /**
   * After async resolve, auto-play() usually fails on mobile (gesture lost).
   * Swap to a playable URL and ask for a fresh tap instead of auto-playing.
   */
  async function handlePreviewError(card, opts) {
    const fromUserGesture = !!opts?.fromUserGesture;
    const resolved = await resolvePreview(card);
    if (resolved?.previewUrl) {
      markPreviewReady(card, resolved);
      if (fromUserGesture) {
        // Still inside the original click stack only if resolve was sync — usually not.
        // Prefer a second tap on iOS/Android rather than a NotAllowedError loop.
        if (typeof showToast === 'function') showToast('Tap play to listen');
        syncActiveCard(false);
        return;
      }
      if (typeof showToast === 'function') showToast('Tap play to listen');
      syncActiveCard(false);
      return;
    }
    markPreviewUnavailable(card);
    if (typeof reportClientError === 'function') {
      reportClientError({
        feature: 'music_preview',
        message: 'Preview resolve failed',
      });
    }
  }

  async function playCard(card) {
    const url = String(card.dataset.musicPreview || '').trim();
    // Never await network resolve before audio.play() — that drops the mobile user-gesture.
    if (!url) {
      await handlePreviewError(card, { fromUserGesture: true });
      return;
    }
    const audio = getSharedAudio();
    ensureCardMediaControls(card);
    if (activeCardEl === card && !audio.paused && !audio.ended) {
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
      audio.dataset.cpTitle = card.dataset.musicTitle || '';
      audio.dataset.cpArtist = card.dataset.musicArtist || '';
      // Always re-assign + load when switching tracks or recovering from error
      const current = audio.currentSrc || audio.src || '';
      if (current !== url && !current.endsWith(url) && current.indexOf(url) === -1) {
        audio.src = url;
        try {
          audio.load();
        } catch (e) {}
      }
      await audio.play();
      syncActiveCard(true);
    } catch (e) {
      const name = e?.name || '';
      if (name === 'NotAllowedError') {
        syncActiveCard(false);
        if (typeof showToast === 'function') showToast('Tap play again to start the song');
        return;
      }
      // Media/network error — resolve alternate preview; do NOT auto-play after await
      await handlePreviewError(card, { fromUserGesture: false });
    }
  }

  function bindCard(card) {
    if (!card || card.dataset.musicBound === '1') return;
    card.dataset.musicBound = '1';
    ensureCardMediaControls(card);
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
    if (typeof apiFetch !== 'function') return { results: [], error: 'unavailable' };
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'music_search', query, limit: 12 },
      });
      if (!envelope?.ok) return { results: [], error: envelope?.error?.message || 'search_failed' };
      return {
        results: Array.isArray(envelope.data?.results) ? envelope.data.results : [],
        error: null,
      };
    } catch (e) {
      return { results: [], error: e?.message || 'search_failed' };
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
    document.querySelector('.music-picker-scrim')?.remove();

    const scrim = document.createElement('div');
    scrim.className = 'music-picker-scrim';
    scrim.dataset.navIgnore = '1';

    const sheet = document.createElement('div');
    sheet.className = 'music-picker-sheet';
    sheet.dataset.navManaged = '1';
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
    device.appendChild(scrim);
    device.appendChild(sheet);
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      sheet.classList.add('is-open');
    });

    const input = sheet.querySelector('.music-picker-input');
    const resultsEl = sheet.querySelector('[data-music-picker-results]');
    let debounceTimer = null;
    let searchSeq = 0;
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(debounceTimer);
      try {
        input?.blur();
      } catch (e) {}
      try {
        if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
        else {
          document.documentElement.classList.remove('kb-open');
          document.documentElement.style.setProperty('--kb-inset', '0px');
        }
      } catch (e) {}
      try {
        if (typeof clearShellGlitches === 'function') clearShellGlitches('music-picker-close');
      } catch (e) {}
      // Clear swipe inline transform so a half-drag cannot leave a hit-target over the shell
      try {
        sheet.style.transform = '';
        sheet.style.transition = '';
      } catch (e) {}
      sheet.classList.remove('is-open');
      scrim.classList.remove('is-open');
      sheet.dataset.guardStale = '1';
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      } catch (e) {
        try {
          sheet.remove();
        } catch (err) {}
      }
      setTimeout(() => {
        try {
          sheet.remove();
        } catch (e) {}
        try {
          scrim.remove();
        } catch (e) {}
        try {
          if (typeof clearKeyboardInset === 'function') clearKeyboardInset();
        } catch (e) {}
      }, 220);
    };
    if (typeof pushNavLayer === 'function') {
      pushNavLayer(sheet, () => close());
    }

    sheet.querySelector('[data-music-picker-close]')?.addEventListener('click', close);
    scrim.addEventListener('click', close);
    if (typeof enableSwipeDismiss === 'function') {
      enableSwipeDismiss(sheet, close);
    }

    async function preferPlayablePreview(music) {
      // Single shared resolve path (media-player.js) — keeps JioSaavn-vs-iTunes
      // preference logic in one place across cards, mini-player, and Mehfil.
      if (typeof resolvePlayableUrl === 'function') return resolvePlayableUrl(music);
      return music;
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
        btn.addEventListener('click', async () => {
          const song = list[Number(btn.dataset.i)];
          if (!song || closed) return;
          let music = normalizeMusic(song) || {
            title: song.title,
            artist: song.artist || 'Unknown artist',
            thumbnail: song.thumbnail || '',
            previewUrl: song.previewUrl || null,
            source: song.previewUrl ? song.source || 'jiosaavn' : 'none',
          };
          if (!music.previewUrl) music.source = 'none';
          btn.disabled = true;
          try {
            music = await preferPlayablePreview(music);
          } catch (e) {
            // Keep original music — never block picker close on resolve failure
          }
          close();
          // Close nav layer BEFORE onSelect; contain select errors (sync + async)
          try {
            const ret = onSelect?.(music);
            if (ret && typeof ret.then === 'function') {
              ret.catch((e) => {
                if (typeof reportClientError === 'function') {
                  reportClientError({
                    feature: 'music_picker_select',
                    message: e?.message || String(e),
                    stack: e?.stack || '',
                  });
                }
                if (typeof clearShellGlitches === 'function') clearShellGlitches('music_picker_select');
              });
            }
          } catch (e) {
            if (typeof reportClientError === 'function') {
              reportClientError({
                feature: 'music_picker_select',
                message: e?.message || String(e),
                stack: e?.stack || '',
              });
            }
            if (typeof clearShellGlitches === 'function') clearShellGlitches('music_picker_select');
          }
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
      const packed = await searchSongs(query);
      const list = Array.isArray(packed) ? packed : packed?.results || [];
      const err = Array.isArray(packed) ? null : packed?.error;
      if (seq !== searchSeq) return;
      if (err && !list.length) {
        renderResults([], 'Couldn’t search songs — try again');
        return;
      }
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
    search: async (q) => {
      const packed = await searchSongs(q);
      return Array.isArray(packed) ? packed : packed?.results || [];
    },
  };
  window.openSongPicker = openSongPicker;
  window.pauseAllMusic = pauseAllMusic;
  window.renderMusicCard = renderMusicCard;
  window.mountMusicCards = mountMusicCards;
})();
