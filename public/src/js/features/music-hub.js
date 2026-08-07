/**
 * Music hub — Radio · Trending · Playlists · Liked · For you · Search.
 * Opened from Baithak song attach and Duniya discovery framing.
 * Uses openLayer / pushNavLayer; never touches history for playback.
 */
(function () {
  'use strict';

  const REFILL_AT = 5;
  let radioSettings = { mood: 'discovery', genre: 'any', language: 'hi' };
  let refillBusy = false;
  let activeRadioMeta = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tt(key, fallback, vars) {
    try {
      if (typeof t === 'function') {
        const v = t(key, vars || {});
        if (v && v !== key) return v;
      }
    } catch (e) {}
    let s = fallback;
    if (vars) Object.entries(vars).forEach(([k, v]) => {
      s = String(s).replace(`{{${k}}}`, v);
    });
    return s;
  }

  function normalizeTrack(s) {
    if (!s) return null;
    return {
      id: s.id || '',
      title: s.title || 'Track',
      artist: s.artist || 'Unknown artist',
      thumbnail: s.thumbnail || '',
      previewUrl: s.previewUrl || null,
      source: s.source || (s.previewUrl ? 'jiosaavn' : 'none'),
    };
  }

  async function apiMusic(action, body = {}) {
    if (typeof apiFetch !== 'function') return { tracks: [], degraded: true };
    try {
      const env = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action, ...body },
      });
      if (!env?.ok) return { tracks: [], error: env?.error?.message || 'failed' };
      return env.data || { tracks: [] };
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({
          feature: 'music_hub',
          message: e?.message || String(e),
          stack: e?.stack || '',
        });
      }
      return { tracks: [], degraded: true };
    }
  }

  function skeleton(n = 5) {
    return Array.from({ length: n }, () =>
      `<div class="music-picker-skel" aria-hidden="true">
        <div class="music-picker-skel-art"></div>
        <div class="music-picker-skel-lines"><div></div><div></div></div>
      </div>`
    ).join('');
  }

  function trackRows(list, { shareMode, radioMeta } = {}) {
    if (!list.length) {
      return `<div class="music-picker-empty">${esc(tt('music_hub_empty', 'Nothing here yet'))}</div>`;
    }
    return list
      .map((s, i) => {
        const art = s.thumbnail
          ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy">`
          : `<span aria-hidden="true">♪</span>`;
        const liked =
          typeof MusicTaste !== 'undefined' && MusicTaste.isLiked?.(s) ? ' is-liked' : '';
        return `<div class="music-hub-row" data-i="${i}">
          <button type="button" class="music-picker-row music-hub-play" data-play="${i}">
            <div class="music-picker-row-art">${art}</div>
            <div class="music-picker-row-meta">
              <div class="music-picker-row-title">${esc(s.title)}</div>
              <div class="music-picker-row-artist">${esc(s.artist)}</div>
            </div>
          </button>
          <button type="button" class="music-hub-like${liked}" data-like="${i}" aria-label="Like">♥</button>
          ${
            shareMode
              ? `<button type="button" class="music-hub-share" data-share="${i}" aria-label="Share">↗</button>`
              : ''
          }
          ${
            radioMeta
              ? `<button type="button" class="music-hub-share" data-share-radio="1" aria-label="Share radio">📻</button>`
              : ''
          }
        </div>`;
      })
      .join('');
  }

  async function ensurePlayable(track) {
    let m = normalizeTrack(track);
    if (!m) return null;
    if (!m.previewUrl && typeof resolvePlayableUrl === 'function') {
      try {
        m = await resolvePlayableUrl(m);
      } catch (e) {}
    }
    return m;
  }

  async function playTracks(tracks, startIndex = 0) {
    const playable = [];
    for (const raw of tracks) {
      const t0 = await ensurePlayable(raw);
      if (t0?.previewUrl) playable.push(t0);
    }
    if (!playable.length) {
      if (typeof showToast === 'function') {
        showToast(tt('music_hub_no_preview', 'No playable preview right now'));
      }
      return;
    }
    const idx = Math.min(Math.max(0, startIndex), playable.length - 1);
    if (typeof setMediaQueue === 'function') {
      setMediaQueue(playable, { startIndex: idx, play: true });
    }
    try {
      MusicTaste?.recordPlay?.(playable[idx]);
    } catch (e) {}
  }

  async function silentRefill() {
    if (refillBusy || !activeRadioMeta) return;
    const state =
      typeof getMediaQueueState === 'function' ? getMediaQueueState() : { remaining: 99 };
    if (state.remaining >= REFILL_AT) return;
    refillBusy = true;
    try {
      const seeds = MusicTaste?.recommendSeeds?.() || [];
      const data = await apiMusic('music_radio', {
        ...activeRadioMeta,
        seeds,
      });
      const tracks = (data.tracks || []).map(normalizeTrack).filter(Boolean);
      if (tracks.length && typeof appendMediaQueue === 'function') {
        appendMediaQueue(tracks);
      }
    } finally {
      refillBusy = false;
    }
  }

  window.onMediaQueueAdvance = function () {
    silentRefill();
  };

  function renderRadioShareCard(meta, sampleTrack) {
    const mood = esc(meta?.mood || 'discovery');
    const genre = esc(meta?.genre || 'any');
    const thumb = sampleTrack?.thumbnail
      ? `<img class="radio-share-art" src="${esc(sampleTrack.thumbnail)}" alt="">`
      : `<div class="radio-share-art radio-share-art--empty">📻</div>`;
    return `<div class="radio-share-card baithak-3d-edge" data-radio-share
      data-mood="${mood}" data-genre="${genre}" data-language="${esc(meta?.language || 'any')}">
      ${thumb}
      <div class="radio-share-meta">
        <div class="radio-share-label">${esc(tt('music_radio_card', 'Chaupaal Radio'))}</div>
        <div class="radio-share-title">${mood} · ${genre}</div>
        <div class="radio-share-sub">${esc(tt('music_radio_tap', 'Tap to tune in'))}</div>
      </div>
    </div>`;
  }

  function openMusicHub(opts = {}) {
    const onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;
    const shareMode = !!onSelect;
    const title = opts.title || tt('music_hub_title', 'Music');
    const initialTab = opts.tab || (shareMode ? 'search' : 'radio');

    document.querySelector('.music-hub-sheet')?.remove();
    document.querySelector('.music-hub-scrim')?.remove();

    const settings = {
      ...radioSettings,
      ...(typeof MusicTaste !== 'undefined' ? MusicTaste.getSettings?.() || {} : {}),
    };
    radioSettings = settings;

    const scrim = document.createElement('div');
    scrim.className = 'music-picker-scrim music-hub-scrim';
    scrim.dataset.navIgnore = '1';

    const sheet = document.createElement('div');
    sheet.className = 'music-picker-sheet music-hub-sheet';
    sheet.dataset.navManaged = '1';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', title);
    sheet.innerHTML = `
      <div class="music-picker-handle" aria-hidden="true"></div>
      <div class="music-picker-head">
        <div class="music-picker-title">${esc(title)}</div>
        <button type="button" class="music-picker-close" data-music-hub-close aria-label="Close">✕</button>
      </div>
      <div class="music-hub-tabs" role="tablist">
        <button type="button" class="music-hub-tab" data-tab="radio" role="tab">Radio</button>
        <button type="button" class="music-hub-tab" data-tab="trending" role="tab">Trending</button>
        <button type="button" class="music-hub-tab" data-tab="foryou" role="tab">For you</button>
        <button type="button" class="music-hub-tab" data-tab="liked" role="tab">Liked</button>
        <button type="button" class="music-hub-tab" data-tab="playlists" role="tab">Lists</button>
        <button type="button" class="music-hub-tab" data-tab="search" role="tab">Search</button>
      </div>
      <div class="music-hub-settings hidden" data-hub-settings>
        <label>Mood
          <select data-set="mood">
            ${['discovery', 'chill', 'energy', 'focus', 'romance', 'nostalgia']
              .map((m) => `<option value="${m}"${settings.mood === m ? ' selected' : ''}>${m}</option>`)
              .join('')}
          </select>
        </label>
        <label>Genre
          <select data-set="genre">
            ${['any', 'bollywood', 'punjabi', 'hiphop', 'pop', 'indie', 'classical']
              .map((m) => `<option value="${m}"${settings.genre === m ? ' selected' : ''}>${m}</option>`)
              .join('')}
          </select>
        </label>
        <label>Language
          <select data-set="language">
            ${['any', 'hi', 'en', 'pa', 'ta', 'te']
              .map((m) => `<option value="${m}"${settings.language === m ? ' selected' : ''}>${m}</option>`)
              .join('')}
          </select>
        </label>
        <label class="music-hub-scope">Trending
          <select data-set="scope">
            ${['global', 'local', 'circle']
              .map(
                (m) =>
                  `<option value="${m}"${(settings.scope || 'local') === m ? ' selected' : ''}>${m}</option>`
              )
              .join('')}
          </select>
        </label>
      </div>
      <label class="music-picker-search-wrap music-hub-search-wrap hidden" data-hub-search>
        <span class="sr-only">Search songs</span>
        <input type="search" class="music-picker-input" data-hub-q placeholder="Song or artist…" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="music-picker-results" data-hub-results>${skeleton(4)}</div>
      <div class="music-hub-footer">
        <button type="button" class="music-hub-cta" data-hub-start-radio>${esc(
          tt('music_start_radio', 'Start radio')
        )}</button>
      </div>`;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(scrim);
    device.appendChild(sheet);
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      sheet.classList.add('is-open');
    });

    let closed = false;
    let currentList = [];
    let tab = initialTab;
    let debounceTimer = null;
    let searchSeq = 0;

    const resultsEl = sheet.querySelector('[data-hub-results]');
    const settingsEl = sheet.querySelector('[data-hub-settings]');
    const searchWrap = sheet.querySelector('[data-hub-search]');
    const footerCta = sheet.querySelector('[data-hub-start-radio]');

    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(debounceTimer);
      sheet.classList.remove('is-open');
      scrim.classList.remove('is-open');
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
      }, 220);
    };

    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-music-hub-close]')?.addEventListener('click', close);
    scrim.addEventListener('click', close);
    if (typeof enableSwipeDismiss === 'function') enableSwipeDismiss(sheet, close);

    sheet.querySelectorAll('[data-set]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const key = sel.getAttribute('data-set');
        radioSettings[key] = sel.value;
        MusicTaste?.setSettings?.(radioSettings);
        if (tab === 'radio' || tab === 'trending') loadTab(tab);
      });
    });

    function wireRows(showRadioShare) {
      resultsEl.querySelectorAll('[data-play]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const i = Number(btn.dataset.play);
          const track = currentList[i];
          if (!track) return;
          if (shareMode && onSelect) {
            const music = await ensurePlayable(track);
            close();
            try {
              const ret = onSelect(music);
              if (ret?.then) ret.catch(() => {});
            } catch (e) {}
            return;
          }
          await playTracks(currentList, i);
        });
      });
      resultsEl.querySelectorAll('[data-like]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const i = Number(btn.dataset.like);
          const track = currentList[i];
          if (!track || !MusicTaste) return;
          if (MusicTaste.isLiked(track)) {
            MusicTaste.unlikeTrack(track);
            btn.classList.remove('is-liked');
          } else {
            MusicTaste.likeTrack(track);
            btn.classList.add('is-liked');
            if (typeof showToast === 'function') showToast(tt('music_liked', 'Saved to Liked'));
          }
        });
      });
      resultsEl.querySelectorAll('[data-share]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const i = Number(btn.dataset.share);
          const track = currentList[i];
          if (!track || !onSelect) return;
          const music = await ensurePlayable(track);
          close();
          try {
            onSelect(music);
          } catch (err) {}
        });
      });
      if (showRadioShare) {
        resultsEl.querySelector('[data-share-radio]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!onSelect) return;
          const sample = currentList[0] || null;
          const cardHtml = renderRadioShareCard(activeRadioMeta || radioSettings, sample);
          close();
          try {
            onSelect({
              __radioShare: true,
              mood: (activeRadioMeta || radioSettings).mood,
              genre: (activeRadioMeta || radioSettings).genre,
              language: (activeRadioMeta || radioSettings).language,
              sample,
              html: cardHtml,
            });
          } catch (err) {}
        });
      }
    }

    async function loadTab(next) {
      tab = next;
      sheet.querySelectorAll('.music-hub-tab').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tab === tab);
      });
      const showSettings = tab === 'radio' || tab === 'trending';
      settingsEl.classList.toggle('hidden', !showSettings);
      searchWrap.classList.toggle('hidden', tab !== 'search');
      footerCta.classList.toggle('hidden', tab !== 'radio');
      settingsEl.querySelector('.music-hub-scope')?.classList.toggle('hidden', tab !== 'trending');

      resultsEl.innerHTML = skeleton(5);
      currentList = [];

      try {
        if (tab === 'search') {
          resultsEl.innerHTML = `<div class="music-picker-hint">${esc(
            tt('music_hub_search_hint', 'Search for a song to share or play')
          )}</div>`;
          return;
        }
        if (tab === 'liked') {
          currentList = (MusicTaste?.getLiked?.() || []).map(normalizeTrack).filter(Boolean);
          resultsEl.innerHTML = trackRows(currentList, { shareMode });
          wireRows(false);
          return;
        }
        if (tab === 'playlists') {
          const pls = MusicTaste?.getPlaylists?.() || [];
          if (!pls.length) {
            resultsEl.innerHTML = `<div class="music-picker-empty">${esc(
              tt('music_hub_no_lists', 'No playlists yet')
            )}</div>`;
            return;
          }
          resultsEl.innerHTML = pls
            .map(
              (p, i) =>
                `<button type="button" class="music-hub-playlist" data-pl="${i}">
                  <strong>${esc(p.name)}</strong>
                  <span>${(p.tracks || []).length} songs</span>
                </button>`
            )
            .join('');
          resultsEl.querySelectorAll('[data-pl]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const pl = pls[Number(btn.dataset.pl)];
              currentList = (pl?.tracks || []).map(normalizeTrack).filter(Boolean);
              resultsEl.innerHTML = trackRows(currentList, { shareMode });
              wireRows(false);
              if (!shareMode && currentList.length) await playTracks(currentList, 0);
            });
          });
          return;
        }
        if (tab === 'radio') {
          activeRadioMeta = {
            mood: radioSettings.mood,
            genre: radioSettings.genre,
            language: radioSettings.language,
          };
          const data = await apiMusic('music_radio', {
            ...activeRadioMeta,
            seeds: MusicTaste?.recommendSeeds?.() || [],
          });
          currentList = (data.tracks || []).map(normalizeTrack).filter(Boolean);
          resultsEl.innerHTML = trackRows(currentList, { shareMode, radioMeta: true });
          wireRows(shareMode);
          return;
        }
        if (tab === 'trending') {
          const scope = radioSettings.scope || 'local';
          const payload = { scope };
          // Circle: only pass real local play seeds (liked/history) — never invent friend listens.
          if (scope === 'circle') {
            const seeds = MusicTaste?.recommendSeeds?.() || [];
            if (seeds.length) payload.seeds = seeds;
          }
          const data = await apiMusic('music_trending', payload);
          currentList = (data.tracks || []).map(normalizeTrack).filter(Boolean);
          resultsEl.innerHTML = trackRows(currentList, { shareMode });
          wireRows(false);
          return;
        }
        if (tab === 'foryou') {
          const data = await apiMusic('music_recommend', {
            seeds: MusicTaste?.recommendSeeds?.() || [],
          });
          currentList = (data.tracks || []).map(normalizeTrack).filter(Boolean);
          resultsEl.innerHTML = trackRows(currentList, { shareMode });
          wireRows(false);
          return;
        }
      } catch (e) {
        resultsEl.innerHTML = `<div class="music-picker-empty">${esc(
          tt('music_hub_error', 'Could not load music')
        )}</div>`;
        if (typeof showFeatureError === 'function') showFeatureError(resultsEl);
      }
    }

    sheet.querySelectorAll('.music-hub-tab').forEach((btn) => {
      btn.addEventListener('click', () => loadTab(btn.dataset.tab));
    });

    footerCta.addEventListener('click', async () => {
      if (!currentList.length) await loadTab('radio');
      activeRadioMeta = {
        mood: radioSettings.mood,
        genre: radioSettings.genre,
        language: radioSettings.language,
      };
      await playTracks(currentList, 0);
      if (typeof showToast === 'function') {
        showToast(tt('music_radio_started', 'Radio on — queue will refill quietly'));
      }
      if (!shareMode) close();
    });

    const input = sheet.querySelector('[data-hub-q]');
    input?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const q = input.value.trim();
        const seq = ++searchSeq;
        if (q.length < 1) {
          resultsEl.innerHTML = `<div class="music-picker-hint">${esc(
            tt('music_hub_search_hint', 'Search for a song to share or play')
          )}</div>`;
          return;
        }
        resultsEl.innerHTML = skeleton(5);
        try {
          const env = await apiFetch('/api/media-config', {
            method: 'POST',
            needAuth: true,
            body: { action: 'music_search', query: q, limit: 16 },
          });
          if (seq !== searchSeq) return;
          currentList = ((env?.data?.results || env?.results || [])).map(normalizeTrack).filter(Boolean);
          resultsEl.innerHTML = trackRows(currentList, { shareMode });
          wireRows(false);
        } catch (e) {
          if (seq !== searchSeq) return;
          resultsEl.innerHTML = `<div class="music-picker-empty">${esc(
            tt('music_hub_error', 'Could not load music')
          )}</div>`;
        }
      }, 320);
    });

    loadTab(tab);
  }

  /** Mount radio share cards after message render */
  function mountRadioShareCards(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-radio-share]').forEach((card) => {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.addEventListener('click', () => {
        openMusicHub({
          tab: 'radio',
          title: tt('music_radio_card', 'Chaupaal Radio'),
        });
        const mood = card.dataset.mood;
        const genre = card.dataset.genre;
        const language = card.dataset.language;
        if (mood || genre || language) {
          MusicTaste?.setSettings?.({ mood, genre, language });
        }
      });
    });
  }

  window.openMusicHub = openMusicHub;
  window.renderRadioShareCard = renderRadioShareCard;
  window.mountRadioShareCards = mountRadioShareCards;

  // Prefer hub from Baithak; fall back keeps openSongPicker
  const _openSongPicker = window.openSongPicker;
  window.openSongPicker = function (opts) {
    if (typeof openMusicHub === 'function') {
      return openMusicHub({
        ...opts,
        tab: opts?.tab || (opts?.onSelect ? 'search' : 'radio'),
        title: opts?.title || tt('music_share_title', 'Share a song'),
      });
    }
    return _openSongPicker?.(opts);
  };
})();
