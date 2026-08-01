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

  function ensureHttpsUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('http://')) return 'https://' + s.slice(7);
    return s;
  }

  function getSharedAudio() {
    if (!sharedAudio) {
      sharedAudio = new Audio();
      sharedAudio.preload = 'auto';
      sharedAudio.setAttribute('playsinline', '');
      sharedAudio.setAttribute('webkit-playsinline', '');
      // Avoid CDN hotlink / Referrer-Policy quirks (Saavn / iTunes).
      try {
        sharedAudio.referrerPolicy = 'no-referrer';
      } catch (e) {}
      // Keep element in DOM — some mobile WebViews won't decode detached Audio nodes
      try {
        sharedAudio.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none;left:-9999px;';
        (document.querySelector('.device') || document.body).appendChild(sharedAudio);
      } catch (e) {}
      window.__chaupaalSharedAudio = sharedAudio;
      sharedAudio.addEventListener('ended', () => syncActiveCard(false));
      sharedAudio.addEventListener('timeupdate', () => {
        if (activeCardEl) {
          updateCardProgress(activeCardEl, sharedAudio);
          updateMediaSession(activeCardEl, sharedAudio);
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
        Promise.resolve(handlePreviewError(activeCardEl, { fromUserGesture: false })).catch(() => {});
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

  function transportHtml(playing) {
    return `<div class="music-card-transport" data-music-transport data-nav-ignore="1">
      <button type="button" class="music-card-transport-btn" data-music-prev aria-label="Previous track">${skipBackIcon()}</button>
      <button type="button" class="music-card-transport-btn music-card-transport-skip" data-music-skip="-10" aria-label="Back 10 seconds">−10</button>
      <button type="button" class="music-card-play" data-music-play aria-label="${playing ? 'Pause song' : 'Play song'}">${playing ? pauseIcon() : playIcon()}</button>
      <button type="button" class="music-card-transport-btn music-card-transport-skip" data-music-skip="10" aria-label="Forward 10 seconds">+10</button>
      <button type="button" class="music-card-transport-btn" data-music-next aria-label="Next track">${skipFwdIcon()}</button>
    </div>
    <div class="music-card-progress-track" aria-hidden="true"><div class="music-card-progress-bar" data-music-progress></div></div>
    <div class="music-card-times">
      <span data-music-elapsed>0:00</span>
      <span data-music-remain>−0:00</span>
    </div>`;
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
    return '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
  }
  function pauseIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  }
  function skipBackIcon() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z"/></svg>';
  }
  function skipFwdIcon() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 6v12l8.5-6L13 6zM4 18l8.5-6L4 6v12z"/></svg>';
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
    try {
      if (typeof syncMiniPlayer === 'function') syncMiniPlayer(null);
    } catch (e) {}
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    } catch (e) {}
  }

  function formatCardTime(sec) {
    if (typeof formatMediaTime === 'function') return formatMediaTime(sec);
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function updateCardProgress(card, audio) {
    if (!card || !audio) return;
    const bar = card.querySelector('[data-music-progress]');
    const elapsed = card.querySelector('[data-music-elapsed]');
    const remain = card.querySelector('[data-music-remain]');
    const d = audio.duration;
    const t = audio.currentTime || 0;
    if (bar && Number.isFinite(d) && d > 0) {
      bar.style.width = Math.min(100, (t / d) * 100) + '%';
    }
    if (elapsed) elapsed.textContent = formatCardTime(t);
    if (remain) remain.textContent = Number.isFinite(d) ? '−' + formatCardTime(Math.max(0, d - t)) : '−0:00';
  }

  function seekCardFromPointer(card, clientX) {
    const track = card.querySelector('.music-card-progress-track');
    const audio = getSharedAudio();
    if (!track || !audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    audio.currentTime = pct * audio.duration;
    updateCardProgress(card, audio);
  }

  function bindCardSeek(card) {
    const track = card.querySelector('.music-card-progress-track');
    if (!track || track.dataset.seekBound === '1') return;
    track.dataset.seekBound = '1';
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Seek');
    track.setAttribute('tabindex', '0');
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      seekCardFromPointer(card, x);
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    track.addEventListener('pointerdown', (e) => {
      if (activeCardEl !== card) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      seekCardFromPointer(card, e.clientX);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    track.addEventListener('touchstart', (e) => {
      if (activeCardEl !== card || !e.touches?.[0]) return;
      e.stopPropagation();
      dragging = true;
      seekCardFromPointer(card, e.touches[0].clientX);
      window.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('touchend', onUp);
    }, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (activeCardEl !== card) return;
      const audio = getSharedAudio();
      if (!audio || !Number.isFinite(audio.duration)) return;
      const step = e.shiftKey ? 10 : 5;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + step);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        audio.currentTime = Math.max(0, (audio.currentTime || 0) - step);
      }
      updateCardProgress(card, audio);
    });
  }

  function wireCardTransport(card) {
    const row = card.querySelector('[data-music-transport]');
    if (!row || row.dataset.transportBound === '1') return;
    row.dataset.transportBound = '1';
    card.querySelector('[data-music-skip="-10"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const audio = getSharedAudio();
      if (activeCardEl !== card || !audio) return;
      audio.currentTime = Math.max(0, (audio.currentTime || 0) - 10);
      updateCardProgress(card, audio);
    });
    card.querySelector('[data-music-skip="10"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const audio = getSharedAudio();
      if (activeCardEl !== card || !audio) return;
      const d = audio.duration;
      audio.currentTime = Math.min(Number.isFinite(d) ? d : 1e9, (audio.currentTime || 0) + 10);
      updateCardProgress(card, audio);
    });
    card.querySelector('[data-music-prev]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof playMediaPrev === 'function') playMediaPrev();
    });
    card.querySelector('[data-music-next]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof playMediaNext === 'function') playMediaNext();
    });
  }

  /** Sync playing card UI when queue prev/next switches tracks. */
  function syncActiveFromTrack(item) {
    const url = ensureHttpsUrl(item?.previewUrl || '');
    if (!url) {
      activeCardEl = null;
      syncActiveCard(false);
      return;
    }
    const cards = Array.from(document.querySelectorAll('[data-music-card]'));
    const match = cards.find((c) => {
      const p = ensureHttpsUrl(c.dataset.musicPreview || '');
      return p && (p === url || p.endsWith(url) || url.endsWith(p) || p.indexOf(url) !== -1 || url.indexOf(p) !== -1);
    });
    if (match) {
      activeCardEl = match;
      if (item?.title) match.dataset.musicTitle = item.title;
      if (item?.artist != null) match.dataset.musicArtist = item.artist || '';
      if (item?.thumb) match.dataset.musicThumb = item.thumb;
      syncActiveCard(true);
      updateCardProgress(match, getSharedAudio());
      updateMediaSession(match, getSharedAudio());
    } else {
      activeCardEl = null;
      syncActiveCard(false);
    }
  }

  function updateMediaSession(card, audio) {
    if (!('mediaSession' in navigator) || !card) return;
    try {
      const artwork = card.dataset.musicThumb
        ? [{ src: card.dataset.musicThumb, sizes: '512x512', type: 'image/jpeg' }]
        : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: card.dataset.musicTitle || 'Chaupaal',
        artist: card.dataset.musicArtist || '',
        album: 'Chaupaal',
        artwork,
      });
      navigator.mediaSession.playbackState = audio?.paused ? 'paused' : 'playing';
      navigator.mediaSession.setActionHandler('play', () => {
        if (typeof quietMode !== 'undefined' && quietMode) return;
        audio?.play?.().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => audio?.pause?.());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (typeof playMediaPrev === 'function') playMediaPrev();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (typeof playMediaNext === 'function') playMediaNext();
      });
      navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const off = d?.seekOffset || 10;
        if (audio) audio.currentTime = Math.max(0, (audio.currentTime || 0) - off);
      });
      navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const off = d?.seekOffset || 10;
        if (audio) {
          const dur = audio.duration;
          audio.currentTime = Math.min(Number.isFinite(dur) ? dur : 1e9, (audio.currentTime || 0) + off);
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (audio && d?.seekTime != null) audio.currentTime = d.seekTime;
      });
    } catch (e) {}
  }

  function normalizeMusic(m) {
    if (!m || typeof m !== 'object') return null;
    const title = String(m.title || '').trim();
    if (!title) return null;
    const previewUrl = m.previewUrl ? ensureHttpsUrl(m.previewUrl) : null;
    return {
      title,
      artist: String(m.artist || 'Unknown artist').trim(),
      thumbnail: ensureHttpsUrl(m.thumbnail || '') || String(m.thumbnail || '').trim(),
      previewUrl: previewUrl || null,
      source: m.source || (previewUrl ? 'jiosaavn' : 'none'),
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
      ? transportHtml(false)
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
    const url = ensureHttpsUrl(resolved.previewUrl);
    card.dataset.musicPreview = url;
    card.dataset.musicSource = resolved.source || 'itunes';
    card.classList.remove('music-card--static');
    const unavail = card.querySelector('.music-card-unavailable');
    if (unavail) {
      unavail.outerHTML = transportHtml(false);
      card.dataset.musicBound = '0';
      bindCard(card);
    }
  }

  function markPreviewUnavailable(card) {
    pauseAllMusic();
    card.classList.add('music-card--static');
    card.dataset.musicPreview = '';
    card.dataset.musicSource = 'none';
    const transport = card.querySelector('[data-music-transport]');
    const track = card.querySelector('.music-card-progress-track');
    const times = card.querySelector('.music-card-times');
    const play = card.querySelector('[data-music-play]');
    const extra = card.querySelector('[data-music-extra-controls]');
    if (transport) {
      transport.replaceWith(
        Object.assign(document.createElement('span'), {
          className: 'music-card-unavailable',
          textContent: 'Preview not available',
        })
      );
    } else if (play) {
      play.replaceWith(
        Object.assign(document.createElement('span'), {
          className: 'music-card-unavailable',
          textContent: 'Preview not available',
        })
      );
    }
    track?.remove();
    times?.remove();
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

  function enqueueVisibleMusicCards(startCard) {
    if (typeof setMediaQueue !== 'function') return;
    const cards = Array.from(document.querySelectorAll('[data-music-card][data-music-preview]')).filter(
      (c) => ensureHttpsUrl(c.dataset.musicPreview || '')
    );
    if (!cards.length) return;
    const tracks = cards.map((c) => ({
      title: c.dataset.musicTitle || 'Track',
      artist: c.dataset.musicArtist || '',
      previewUrl: ensureHttpsUrl(c.dataset.musicPreview || ''),
      thumb: ensureHttpsUrl(c.dataset.musicThumb || '') || c.dataset.musicThumb || '',
    }));
    let startIndex = cards.indexOf(startCard);
    if (startIndex < 0) startIndex = 0;
    setMediaQueue(tracks, { startIndex, play: false });
  }

  async function playCard(card) {
    if (typeof quietMode !== 'undefined' && quietMode) {
      if (typeof showToast === 'function') {
        showToast(typeof t === 'function' ? t('quiet_voice_muted', 'Quiet mode is on') : 'Quiet mode is on');
      }
      return;
    }
    const url = ensureHttpsUrl(card.dataset.musicPreview || '');
    // Never await network resolve before audio.play() — that drops the mobile user-gesture.
    if (!url) {
      await handlePreviewError(card, { fromUserGesture: true });
      return;
    }
    const audio = getSharedAudio();
    if (activeCardEl === card && !audio.paused && !audio.ended && !audio.error) {
      audio.pause();
      syncActiveCard(false);
      updateMediaSession(card, audio);
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
      enqueueVisibleMusicCards(card);
      // Re-assign when switching tracks OR when the element is in an error state
      // (same src after MEDIA_ERR_* will otherwise fail play() forever).
      const current = audio.currentSrc || audio.src || '';
      const needsSrc =
        !!audio.error ||
        (current !== url && !current.endsWith(url) && current.indexOf(url) === -1);
      if (needsSrc) {
        try {
          audio.removeAttribute('src');
          audio.load();
        } catch (e) {}
        audio.src = url;
        try {
          audio.load();
        } catch (e) {}
      }
      await audio.play();
      syncActiveCard(true);
      updateCardProgress(card, audio);
      updateMediaSession(card, audio);
      if (typeof syncMiniPlayer === 'function') syncMiniPlayer(audio);
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
    bindCardSeek(card);
    wireCardTransport(card);
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
      const authFail = e?.code === 'AUTH_REQUIRED' || /sign in/i.test(e?.message || '');
      return {
        results: [],
        error: authFail ? 'Sign in to search songs' : e?.message || 'search_failed',
      };
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
        renderResults([], /sign in/i.test(String(err)) ? String(err) : 'Couldn’t search songs — try again');
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

  // Do not pause music on overlay dismiss / tab hide — mini-player owns stop.
  // (Stories still call pauseAllMusic on their own viewer dismiss.)

  window.MusicCard = {
    render: renderMusicCard,
    mount: mountMusicCards,
    pauseAll: pauseAllMusic,
    openPicker: openSongPicker,
    normalize: normalizeMusic,
    syncFromTrack: syncActiveFromTrack,
    search: async (q) => {
      const packed = await searchSongs(q);
      return Array.isArray(packed) ? packed : packed?.results || [];
    },
  };
  window.syncMusicCardFromTrack = syncActiveFromTrack;
  // JioSaavn/iTunes integration boundary (CONVENTIONS 4c). renderMusicCard is
  // NOT wrapped — callers concatenate its return into HTML, so a null from the
  // guard would render the literal text "null".
  const guardMusic = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openSongPicker = guardMusic('music_picker', openSongPicker);
  window.pauseAllMusic = pauseAllMusic;
  window.renderMusicCard = renderMusicCard;
  window.mountMusicCards = guardMusic('music_mount', mountMusicCards);
})();
