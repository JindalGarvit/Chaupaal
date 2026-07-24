/**
 * Shared in-app media player — seek, ±10s, buffering, mini-player, simple queue.
 * CONTRACT (CONVENTIONS.md): never touch navigation history.
 * music-card.js owns the shared Audio element; this module owns chrome + queue UI.
 */
(function () {
  'use strict';

  const boundCleanups = new WeakMap();
  /** @type {{ title: string, artist?: string, previewUrl: string, thumb?: string }[]} */
  let queue = [];
  let queueIndex = -1;
  let miniBound = false;

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function controlsHtml() {
    return `<div class="cp-media-controls" data-cp-media-controls data-nav-ignore="1">
      <button type="button" class="cp-media-skip" data-cp-skip="-10" aria-label="Back 10 seconds">−10</button>
      <div class="cp-media-times"><span data-cp-elapsed>0:00</span><span data-cp-remain>−0:00</span></div>
      <button type="button" class="cp-media-skip" data-cp-skip="10" aria-label="Forward 10 seconds">+10</button>
      <div class="cp-media-seek-wrap">
        <input type="range" class="cp-media-seek" data-cp-seek min="0" max="1000" value="0" step="1" aria-label="Seek">
      </div>
      <span class="cp-media-buffering hidden" data-cp-buffering aria-live="polite">Loading…</span>
    </div>`;
  }

  function ensureMiniPlayer() {
    let bar = document.getElementById('cpMiniPlayer');
    if (bar) return bar;
    const device = document.querySelector('.device') || document.body;
    bar = document.createElement('div');
    bar.id = 'cpMiniPlayer';
    bar.className = 'cp-mini-player hidden';
    bar.dataset.navIgnore = '1';
    bar.innerHTML = `
      <button type="button" class="cp-mini-art" data-cp-mini-art aria-hidden="true">♪</button>
      <div class="cp-mini-meta">
        <div class="cp-mini-title" data-cp-mini-title>Now playing</div>
        <div class="cp-mini-artist" data-cp-mini-artist></div>
        <input type="range" class="cp-mini-seek" data-cp-mini-seek min="0" max="1000" value="0" step="1" aria-label="Seek">
      </div>
      <div class="cp-mini-actions">
        <button type="button" data-cp-mini-prev aria-label="Previous">⏮</button>
        <button type="button" data-cp-mini-play aria-label="Play">▶</button>
        <button type="button" data-cp-mini-next aria-label="Next">⏭</button>
        <button type="button" data-cp-mini-close aria-label="Close">✕</button>
      </div>`;
    device.appendChild(bar);
    return bar;
  }

  function getSharedAudio() {
    if (typeof MusicCard !== 'undefined' && MusicCard) {
      // music-card keeps private sharedAudio — use document query or window hook
    }
    return window.__chaupaalSharedAudio || null;
  }

  function setSharedAudioRef(audio) {
    window.__chaupaalSharedAudio = audio;
  }

  function syncMiniFromMedia(media) {
    const bar = ensureMiniPlayer();
    if (!media || media.paused || !media.src) {
      // Keep visible if queue has items
      if (!queue.length) bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    const title = media.dataset.cpTitle || document.querySelector('.music-card.is-playing .music-card-title')?.textContent || 'Now playing';
    const artist = media.dataset.cpArtist || document.querySelector('.music-card.is-playing .music-card-artist')?.textContent || '';
    const titleEl = bar.querySelector('[data-cp-mini-title]');
    const artistEl = bar.querySelector('[data-cp-mini-artist]');
    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist;
    const playBtn = bar.querySelector('[data-cp-mini-play]');
    if (playBtn) playBtn.textContent = media.paused ? '▶' : '⏸';
    const seek = bar.querySelector('[data-cp-mini-seek]');
    const d = media.duration;
    if (seek && Number.isFinite(d) && d > 0) {
      seek.value = String(Math.round(((media.currentTime || 0) / d) * 1000));
    }
  }

  function bindMiniOnce(media) {
    if (!media || miniBound) return;
    miniBound = true;
    setSharedAudioRef(media);
    const bar = ensureMiniPlayer();
    bar.querySelector('[data-cp-mini-play]')?.addEventListener('click', () => {
      if (media.paused) media.play().catch(() => {});
      else media.pause();
    });
    bar.querySelector('[data-cp-mini-close]')?.addEventListener('click', () => {
      try {
        media.pause();
      } catch (e) {}
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
      bar.classList.add('hidden');
      queue = [];
      queueIndex = -1;
    });
    bar.querySelector('[data-cp-mini-prev]')?.addEventListener('click', () => playQueueIndex(queueIndex - 1));
    bar.querySelector('[data-cp-mini-next]')?.addEventListener('click', () => playQueueIndex(queueIndex + 1));
    let seeking = false;
    const seek = bar.querySelector('[data-cp-mini-seek]');
    seek?.addEventListener('input', () => {
      seeking = true;
    });
    seek?.addEventListener('change', () => {
      seeking = false;
      const d = media.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      media.currentTime = (Number(seek.value) / 1000) * d;
    });
    media.addEventListener('timeupdate', () => {
      if (!seeking) syncMiniFromMedia(media);
    });
    media.addEventListener('play', () => syncMiniFromMedia(media));
    media.addEventListener('pause', () => syncMiniFromMedia(media));
    media.addEventListener('ended', () => playQueueIndex(queueIndex + 1));
  }

  function playQueueIndex(i) {
    if (!queue.length) return;
    if (i < 0 || i >= queue.length) return;
    queueIndex = i;
    const item = queue[i];
    if (typeof MusicCard !== 'undefined' && item) {
      // Best-effort: set audio src via a synthetic card play path
    }
    const audio = getSharedAudio() || window.__chaupaalSharedAudio;
    if (!audio || !item?.previewUrl) return;
    audio.dataset.cpTitle = item.title || 'Track';
    audio.dataset.cpArtist = item.artist || '';
    audio.src = item.previewUrl;
    audio.play().catch(() => {});
    syncMiniFromMedia(audio);
  }

  /**
   * Enqueue tracks for mini-player next/prev (does not auto-start).
   * @param {{ title: string, artist?: string, previewUrl: string }[]} tracks
   * @param {{ startIndex?: number, play?: boolean }} [opts]
   */
  function setMediaQueue(tracks, opts = {}) {
    queue = Array.isArray(tracks) ? tracks.filter((t) => t && t.previewUrl) : [];
    queueIndex = typeof opts.startIndex === 'number' ? opts.startIndex : 0;
    if (opts.play && queue[queueIndex]) playQueueIndex(queueIndex);
  }

  function bindMediaControls(media, hostEl, opts = {}) {
    if (!media || !hostEl) return () => {};
    setSharedAudioRef(media);
    bindMiniOnce(media);

    let box = hostEl.querySelector('[data-cp-media-controls]');
    if (!box) {
      const wrap = document.createElement('div');
      wrap.innerHTML = controlsHtml();
      box = wrap.firstElementChild;
      box.dataset.navIgnore = '1';
      if (opts.insert === 'prepend' && hostEl.firstChild) hostEl.insertBefore(box, hostEl.firstChild);
      else hostEl.appendChild(box);
    }
    const seek = box.querySelector('[data-cp-seek]');
    const elapsed = box.querySelector('[data-cp-elapsed]');
    const remain = box.querySelector('[data-cp-remain]');
    const buffering = box.querySelector('[data-cp-buffering]');
    let seeking = false;

    const sync = () => {
      const d = media.duration;
      const t = media.currentTime || 0;
      if (elapsed) elapsed.textContent = formatTime(t);
      if (remain) {
        remain.textContent = Number.isFinite(d) ? '−' + formatTime(Math.max(0, d - t)) : '−0:00';
      }
      if (seek && Number.isFinite(d) && d > 0 && !seeking) {
        seek.value = String(Math.round((t / d) * 1000));
      }
      syncMiniFromMedia(media);
    };

    const setBuffering = (on) => {
      buffering?.classList.toggle('hidden', !on);
    };

    const onSkip = (e) => {
      const btn = e.target.closest('[data-cp-skip]');
      if (!btn) return;
      const delta = Number(btn.dataset.cpSkip) || 0;
      try {
        const next = Math.max(0, Math.min(media.duration || 1e9, (media.currentTime || 0) + delta));
        media.currentTime = next;
        sync();
      } catch (err) {}
    };

    const onSeekInput = () => {
      seeking = true;
    };
    const onSeekChange = () => {
      seeking = false;
      const d = media.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      media.currentTime = (Number(seek.value) / 1000) * d;
      sync();
    };

    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      syncMiniFromMedia(media);
    };
    const onCanPlay = () => setBuffering(false);
    const onSeeking = () => setBuffering(true);
    const onSeeked = () => setBuffering(false);

    box.addEventListener('click', onSkip);
    seek?.addEventListener('input', onSeekInput);
    seek?.addEventListener('change', onSeekChange);
    media.addEventListener('timeupdate', sync);
    media.addEventListener('loadedmetadata', sync);
    media.addEventListener('durationchange', sync);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('playing', onPlaying);
    media.addEventListener('canplay', onCanPlay);
    media.addEventListener('seeking', onSeeking);
    media.addEventListener('seeked', onSeeked);
    sync();

    const cleanup = () => {
      box.removeEventListener('click', onSkip);
      seek?.removeEventListener('input', onSeekInput);
      seek?.removeEventListener('change', onSeekChange);
      media.removeEventListener('timeupdate', sync);
      media.removeEventListener('loadedmetadata', sync);
      media.removeEventListener('durationchange', sync);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('canplay', onCanPlay);
      media.removeEventListener('seeking', onSeeking);
      media.removeEventListener('seeked', onSeeked);
      boundCleanups.delete(media);
    };
    const prev = boundCleanups.get(media);
    if (prev) prev();
    boundCleanups.set(media, cleanup);
    return cleanup;
  }

  function enhanceMediaIn(root) {
    if (!root) return;
    root.querySelectorAll('video, audio').forEach((media) => {
      if (media.dataset.cpMediaBound === '1') return;
      media.dataset.cpMediaBound = '1';
      const host =
        media.closest('.music-card, .story-media, .lehar-item, .duniya-post-media, .ppm-cell, .profile-media-cell') ||
        media.parentElement;
      if (!host) return;
      bindMediaControls(media, host);
    });
  }

  // Expose shared audio from music-card when it creates one
  const origDesc = Object.getOwnPropertyDescriptor(window, '__chaupaalSharedAudio');
  document.addEventListener(
    'play',
    (e) => {
      const t = e.target;
      if (t && (t.tagName === 'AUDIO' || t.tagName === 'VIDEO')) {
        setSharedAudioRef(t);
        bindMiniOnce(t);
        syncMiniFromMedia(t);
      }
    },
    true
  );

  window.formatMediaTime = formatTime;
  window.mediaControlsHtml = controlsHtml;
  window.bindMediaControls = bindMediaControls;
  window.enhanceMediaIn = enhanceMediaIn;
  window.setMediaQueue = setMediaQueue;
  window.syncMiniPlayer = syncMiniFromMedia;
})();
