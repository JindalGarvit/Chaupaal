/**
 * Shared in-app media player controls — seek, ±10s, elapsed/remaining, buffering.
 * Bind to any HTMLMediaElement (audio/video). Used by music cards, voice notes, story/duniya video.
 */
(function () {
  'use strict';

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function controlsHtml() {
    return `<div class="cp-media-controls" data-cp-media-controls>
      <button type="button" class="cp-media-skip" data-cp-skip="-10" aria-label="Back 10 seconds">−10</button>
      <div class="cp-media-times"><span data-cp-elapsed>0:00</span><span data-cp-remain>−0:00</span></div>
      <button type="button" class="cp-media-skip" data-cp-skip="10" aria-label="Forward 10 seconds">+10</button>
      <div class="cp-media-seek-wrap">
        <input type="range" class="cp-media-seek" data-cp-seek min="0" max="1000" value="0" step="1" aria-label="Seek">
      </div>
      <span class="cp-media-buffering hidden" data-cp-buffering aria-live="polite">Loading…</span>
    </div>`;
  }

  /**
   * @param {HTMLMediaElement} media
   * @param {Element} hostEl - container to append/find controls
   * @param {{ insert?: 'append'|'prepend'|'replace' }} [opts]
   */
  function bindMediaControls(media, hostEl, opts = {}) {
    if (!media || !hostEl) return () => {};
    let box = hostEl.querySelector('[data-cp-media-controls]');
    if (!box) {
      const wrap = document.createElement('div');
      wrap.innerHTML = controlsHtml();
      box = wrap.firstElementChild;
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

    box.addEventListener('click', onSkip);
    seek?.addEventListener('input', onSeekInput);
    seek?.addEventListener('change', onSeekChange);
    media.addEventListener('timeupdate', sync);
    media.addEventListener('loadedmetadata', sync);
    media.addEventListener('durationchange', sync);
    media.addEventListener('waiting', () => setBuffering(true));
    media.addEventListener('playing', () => setBuffering(false));
    media.addEventListener('canplay', () => setBuffering(false));
    media.addEventListener('seeking', () => setBuffering(true));
    media.addEventListener('seeked', () => setBuffering(false));
    sync();

    return () => {
      box.removeEventListener('click', onSkip);
      seek?.removeEventListener('input', onSeekInput);
      seek?.removeEventListener('change', onSeekChange);
      media.removeEventListener('timeupdate', sync);
      media.removeEventListener('loadedmetadata', sync);
      media.removeEventListener('durationchange', sync);
    };
  }

  /** Enhance existing <video>/<audio> nodes under root (skip if already bound). */
  function enhanceMediaIn(root) {
    if (!root) return;
    root.querySelectorAll('video, audio').forEach((media) => {
      if (media.dataset.cpMediaBound === '1') return;
      media.dataset.cpMediaBound = '1';
      const host =
        media.closest('.music-card, .story-media, .lehar-item, .duniya-post-media, .ppm-cell, .profile-media-cell') ||
        media.parentElement;
      if (!host) return;
      // Avoid doubling native controls UI clutter — keep native play if present, add seek row
      bindMediaControls(media, host);
    });
  }

  window.formatMediaTime = formatTime;
  window.mediaControlsHtml = controlsHtml;
  window.bindMediaControls = bindMediaControls;
  window.enhanceMediaIn = enhanceMediaIn;
})();
