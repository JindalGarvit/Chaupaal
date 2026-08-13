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

  function quietBlocked() {
    if (typeof quietMode === 'undefined' || !quietMode) return false;
    if (typeof showToast === 'function') {
      showToast(typeof t === 'function' ? t('quiet_voice_muted', 'Quiet mode is on') : 'Quiet mode is on');
    }
    return true;
  }

  const MINI_POS_KEY = 'chaupaal_mini_player_pos';
  /** Clear move before we treat the gesture as a drag (not a tap). */
  const DRAG_MOVE_PX = 14;
  /** Press-hold arms drag without needing to move first. */
  const DRAG_HOLD_MS = 180;
  let miniDragWired = false;
  let miniUiBound = false;

  function loadMiniPos() {
    try {
      const raw = JSON.parse(localStorage.getItem(MINI_POS_KEY) || 'null');
      if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
    } catch (e) {}
    return null;
  }

  function saveMiniPos(x, y) {
    try {
      localStorage.setItem(MINI_POS_KEY, JSON.stringify({ x, y }));
    } catch (e) {}
  }

  function miniHostMetrics(bar) {
    const host = (bar && bar.offsetParent) || document.querySelector('.device') || document.body;
    const rect = host.getBoundingClientRect();
    const tabH =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) ||
      64;
    return {
      host,
      rect,
      size: 56,
      tabReserve: tabH + 16,
    };
  }

  function clampMiniPos(bar, x, y) {
    const { rect, size, tabReserve } = miniHostMetrics(bar);
    const maxX = Math.max(8, rect.width - size - 8);
    const maxY = Math.max(8, rect.height - size - tabReserve);
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    };
  }

  function applyMiniPos(bar) {
    if (!bar || bar.classList.contains('is-expanded') || bar.dataset.dragging === '1') {
      if (bar?.classList.contains('is-expanded')) {
        bar.style.removeProperty('left');
        bar.style.removeProperty('top');
        bar.style.removeProperty('right');
        bar.style.removeProperty('bottom');
      }
      return;
    }
    const pos = loadMiniPos();
    if (!pos) return;
    const c = clampMiniPos(bar, pos.x, pos.y);
    bar.style.left = `${c.x}px`;
    bar.style.top = `${c.y}px`;
    bar.style.right = 'auto';
    bar.style.bottom = 'auto';
  }

  function expandMiniPlayer() {
    const bar = ensureMiniPlayer();
    if (bar.classList.contains('is-expanded')) return;
    setMiniExpanded(true);
    try {
      if (typeof restoreAppShell === 'function') restoreAppShell('mini_player_expand');
    } catch (e) {}
    syncMiniFromMedia(getSharedAudio());
  }

  function collapseMiniPlayer() {
    const bar = ensureMiniPlayer();
    setMiniExpanded(false);
    applyMiniPos(bar);
    syncMiniFromMedia(getSharedAudio());
  }

  /**
   * Tap vs drag:
   * - short tap (no hold, move < DRAG_MOVE_PX) → expand
   * - press-hold DRAG_HOLD_MS OR move ≥ DRAG_MOVE_PX → drag; release saves pos, no expand
   */
  function wireMiniDrag(bar) {
    if (!bar || miniDragWired) return;
    miniDragWired = true;

    let tracking = false;
    let dragging = false;
    let didDrag = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;
    let holdTimer = null;
    let pointerId = null;

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const beginDrag = () => {
      if (dragging || bar.classList.contains('is-expanded')) return;
      dragging = true;
      bar.dataset.dragging = '1';
      bar.classList.add('is-dragging');
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
      // Seed left/top from current painted box if not yet set
      if (!bar.style.left || !bar.style.top) {
        const { host } = miniHostMetrics(bar);
        const br = bar.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        bar.style.left = `${br.left - hr.left}px`;
        bar.style.top = `${br.top - hr.top}px`;
        origLeft = br.left - hr.left;
        origTop = br.top - hr.top;
      }
    };

    const onMove = (e) => {
      if (!tracking || bar.classList.contains('is-expanded')) return;
      const pt = e.touches ? e.touches[0] : e;
      if (!pt) return;
      const dx = pt.clientX - startX;
      const dy = pt.clientY - startY;
      const dist = Math.hypot(dx, dy);
      if (!dragging && dist >= DRAG_MOVE_PX) {
        clearHold();
        beginDrag();
      }
      if (!dragging) return;
      didDrag = true;
      e.preventDefault?.();
      const c = clampMiniPos(bar, origLeft + dx, origTop + dy);
      bar.style.left = `${c.x}px`;
      bar.style.top = `${c.y}px`;
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
    };

    const onUp = (e) => {
      if (!tracking) return;
      tracking = false;
      clearHold();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onUp);
      try {
        if (pointerId != null && bar.releasePointerCapture) bar.releasePointerCapture(pointerId);
      } catch (err) {}
      pointerId = null;

      const wasDragging = dragging;
      dragging = false;
      delete bar.dataset.dragging;
      bar.classList.remove('is-dragging');

      if (wasDragging && didDrag) {
        const left = parseFloat(bar.style.left);
        const top = parseFloat(bar.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) saveMiniPos(left, top);
        bar.dataset.suppressTap = '1';
        setTimeout(() => {
          delete bar.dataset.suppressTap;
        }, 120);
        return;
      }
      // True tap → expand (ignore synthetic clicks from controls)
      if (bar.classList.contains('is-expanded')) return;
      const target = e?.target || e?.changedTouches?.[0]?.target;
      if (target?.closest?.('[data-cp-mini-close], [data-cp-mini-play], input, a, [data-cp-mini-panel]')) {
        return;
      }
      if (bar.dataset.suppressTap === '1') return;
      expandMiniPlayer();
      // Swallow the trailing click that would immediately collapse
      bar.dataset.suppressTap = '1';
      setTimeout(() => {
        delete bar.dataset.suppressTap;
      }, 320);
    };

    const onDown = (e) => {
      if (bar.classList.contains('is-expanded')) return;
      if (bar.classList.contains('hidden')) return;
      if (e.target.closest('[data-cp-mini-close], [data-cp-mini-play], input, a, [data-cp-mini-panel]')) {
        return;
      }
      // Only primary button / touch
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      tracking = true;
      dragging = false;
      didDrag = false;
      delete bar.dataset.suppressTap;
      const pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX;
      startY = pt.clientY;
      const { host } = miniHostMetrics(bar);
      const br = bar.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      origLeft = br.left - hr.left;
      origTop = br.top - hr.top;
      pointerId = e.pointerId != null ? e.pointerId : null;
      try {
        if (pointerId != null && bar.setPointerCapture) bar.setPointerCapture(pointerId);
      } catch (err) {}

      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (tracking && !dragging) beginDrag();
      }, DRAG_HOLD_MS);

      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      document.addEventListener('touchcancel', onUp);
    };

    bar.addEventListener('pointerdown', onDown, { passive: true });
  }

  function ensureMiniPlayer() {
    let bar = document.getElementById('cpMiniPlayer');
    if (bar) {
      bar.classList.add('cp-mini-player');
      bar.dataset.navIgnore = '1';
      bar.setAttribute('data-nav-ignore', '1');
      wireMiniDrag(bar);
      wireMiniUi(bar);
      if (!bar.classList.contains('is-expanded') && bar.dataset.dragging !== '1') {
        applyMiniPos(bar);
      }
      return bar;
    }
    const device = document.querySelector('.device') || document.body;
    bar = document.createElement('div');
    bar.id = 'cpMiniPlayer';
    bar.className = 'cp-mini-player cp-mini-fab hidden';
    bar.dataset.navIgnore = '1';
    bar.setAttribute('data-nav-ignore', '1');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Now playing');
    bar.innerHTML = `
      <div class="cp-mini-compact" data-cp-mini-body>
        <button type="button" class="cp-mini-art" data-cp-mini-art aria-label="Expand player" tabindex="-1">♪</button>
        <div class="cp-mini-meta">
          <div class="cp-mini-title" data-cp-mini-title>Now playing</div>
          <div class="cp-mini-artist" data-cp-mini-artist></div>
        </div>
        <div class="cp-mini-actions">
          <button type="button" data-cp-mini-play aria-label="Play">▶</button>
          <button type="button" data-cp-mini-close aria-label="Stop and dismiss">✕</button>
        </div>
      </div>
      <div class="cp-mini-expanded-panel" data-cp-mini-panel hidden>
        <div class="cp-mini-seek-row">
          <span data-cp-mini-elapsed>0:00</span>
          <div class="cp-mini-seek-wrap">
            <input type="range" class="cp-mini-seek" data-cp-mini-seek min="0" max="1000" value="0" step="1" aria-label="Seek">
          </div>
          <span data-cp-mini-remain>−0:00</span>
        </div>
        <div class="cp-mini-transport">
          <button type="button" data-cp-mini-prev aria-label="Previous">⏮</button>
          <button type="button" data-cp-mini-skip="-10" aria-label="Back 10 seconds">−10</button>
          <button type="button" data-cp-mini-play-exp aria-label="Play">▶</button>
          <button type="button" data-cp-mini-skip="10" aria-label="Forward 10 seconds">+10</button>
          <button type="button" data-cp-mini-next aria-label="Next">⏭</button>
          <button type="button" data-cp-mini-collapse aria-label="Collapse">▴</button>
          <button type="button" data-cp-mini-close-exp aria-label="Stop and dismiss">✕</button>
        </div>
      </div>`;
    device.appendChild(bar);
    wireMiniDrag(bar);
    wireMiniUi(bar);
    applyMiniPos(bar);
    return bar;
  }

  /** Hide FAB while the playing card is still on-screen in chat/story. */
  function cardChromeOwnsPlayback() {
    const card = document.querySelector('.music-card.is-playing');
    if (!card || !card.isConnected) return false;
    if (card.closest('.story-viewer')) return true;
    const chat = document.getElementById('activeChatScreen');
    if (chat && chat.classList.contains('open') && chat.contains(card)) return true;
    return false;
  }

  function setMiniExpanded(on) {
    const bar = ensureMiniPlayer();
    const panel = bar.querySelector('[data-cp-mini-panel]');
    bar.classList.toggle('is-expanded', !!on);
    bar.classList.toggle('cp-mini-fab', !on);
    bar.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (panel) {
      panel.hidden = !on;
      panel.style.display = on ? '' : 'none';
    }
    if (on) {
      bar.style.removeProperty('left');
      bar.style.removeProperty('top');
      bar.style.removeProperty('right');
      bar.style.removeProperty('bottom');
    } else if (bar.dataset.dragging !== '1') {
      applyMiniPos(bar);
    }
  }

  function getSharedAudio() {
    return window.__chaupaalSharedAudio || null;
  }

  function setSharedAudioRef(audio) {
    window.__chaupaalSharedAudio = audio;
  }

  function updateMiniArt(bar, thumb) {
    const artBtn = bar.querySelector('[data-cp-mini-art]');
    if (!artBtn) return;
    const src = String(thumb || '').trim();
    if (src) {
      artBtn.classList.add('has-thumb');
      artBtn.innerHTML = `<img src="${src.replace(/"/g, '&quot;')}" alt="" decoding="async">`;
    } else {
      artBtn.classList.remove('has-thumb');
      artBtn.textContent = '♪';
    }
  }

  function syncMiniFromMedia(media) {
    const bar = ensureMiniPlayer();
    const audio = media || getSharedAudio();
    if (!audio) {
      bar.classList.add('hidden');
      setMiniExpanded(false);
      return;
    }
    bindMiniOnce(audio);
    setSharedAudioRef(audio);

    const hasSrc = !!(audio.src || audio.currentSrc);
    const playing = !audio.paused && hasSrc;
    // Keep FAB while paused-with-src so pause/resume works; only hide when fully cleared
    if (!hasSrc && !queue.length) {
      bar.classList.add('hidden');
      setMiniExpanded(false);
      return;
    }

    // Prefer in-card controls while the full card is still visible
    if (playing && cardChromeOwnsPlayback() && !bar.classList.contains('is-expanded')) {
      bar.classList.add('hidden');
      return;
    }

    if (hasSrc || queue.length) bar.classList.remove('hidden');
    // Never collapse or fight drag position from timeupdate sync
    if (!bar.classList.contains('is-expanded') && bar.dataset.dragging !== '1') {
      bar.classList.add('cp-mini-fab');
      applyMiniPos(bar);
    }

    const qItem = queueIndex >= 0 && queue[queueIndex] ? queue[queueIndex] : null;
    const title =
      audio.dataset.cpTitle ||
      qItem?.title ||
      document.querySelector('.music-card.is-playing .music-card-title')?.textContent ||
      'Now playing';
    let artist =
      audio.dataset.cpArtist ||
      qItem?.artist ||
      document.querySelector('.music-card.is-playing .music-card-artist')?.textContent ||
      '';
    if (queue.length > 1 && queueIndex >= 0) {
      const pos = `${queueIndex + 1}/${queue.length}`;
      artist = artist ? `${artist} · ${pos}` : pos;
    }
    const titleEl = bar.querySelector('[data-cp-mini-title]');
    const artistEl = bar.querySelector('[data-cp-mini-artist]');
    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist;

    const thumb =
      qItem?.thumb ||
      document.querySelector('.music-card.is-playing')?.dataset?.musicThumb ||
      '';
    updateMiniArt(bar, thumb);

    const playBtns = bar.querySelectorAll('[data-cp-mini-play], [data-cp-mini-play-exp]');
    playBtns.forEach((playBtn) => {
      playBtn.textContent = audio.paused ? '▶' : '⏸';
      playBtn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
    });
    const prevBtn = bar.querySelector('[data-cp-mini-prev]');
    const nextBtn = bar.querySelector('[data-cp-mini-next]');
    if (prevBtn) prevBtn.disabled = !(queue.length > 1 && queueIndex > 0);
    if (nextBtn) nextBtn.disabled = !(queue.length > 1 && queueIndex < queue.length - 1);

    const d = audio.duration;
    const t = audio.currentTime || 0;
    const seek = bar.querySelector('[data-cp-mini-seek]');
    if (seek && Number.isFinite(d) && d > 0 && seek.dataset.seeking !== '1') {
      seek.value = String(Math.round((t / d) * 1000));
    }
    const elapsed = bar.querySelector('[data-cp-mini-elapsed]');
    const remain = bar.querySelector('[data-cp-mini-remain]');
    if (elapsed) elapsed.textContent = formatTime(t);
    if (remain) remain.textContent = Number.isFinite(d) ? '−' + formatTime(Math.max(0, d - t)) : '−0:00';
  }

  function stopMiniAndClear() {
    queue = [];
    queueIndex = -1;
    setMiniExpanded(false);
    const media = getSharedAudio();
    try {
      media?.pause?.();
    } catch (err) {}
    if (typeof pauseAllMusic === 'function') pauseAllMusic();
    else {
      try {
        media?.removeAttribute?.('src');
        media?.load?.();
      } catch (err) {}
    }
    ensureMiniPlayer().classList.add('hidden');
  }

  function wireMiniUi(bar) {
    if (!bar || miniUiBound) return;
    miniUiBound = true;

    const resolveAudio = () => getSharedAudio();

    const togglePlay = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const audio = resolveAudio();
      if (!audio) return;
      if (audio.paused) {
        if (quietBlocked()) return;
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
      syncMiniFromMedia(audio);
    };

    bar.querySelector('[data-cp-mini-play]')?.addEventListener('click', togglePlay);
    bar.querySelector('[data-cp-mini-play-exp]')?.addEventListener('click', togglePlay);
    const onClose = (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopMiniAndClear();
    };
    bar.querySelector('[data-cp-mini-close]')?.addEventListener('click', onClose);
    bar.querySelector('[data-cp-mini-close-exp]')?.addEventListener('click', onClose);
    bar.querySelector('[data-cp-mini-prev]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playMediaPrev();
    });
    bar.querySelector('[data-cp-mini-next]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playMediaNext();
    });
    bar.querySelector('[data-cp-mini-collapse]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      collapseMiniPlayer();
    });
    bar.querySelectorAll('[data-cp-mini-skip]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const audio = resolveAudio();
        if (!audio) return;
        const delta = Number(btn.dataset.cpMiniSkip) || 0;
        try {
          const next = Math.max(0, Math.min(audio.duration || 1e9, (audio.currentTime || 0) + delta));
          audio.currentTime = next;
          syncMiniFromMedia(audio);
        } catch (err) {}
      });
    });

    // Expanded: tap title/meta row collapses (controls stopPropagation)
    bar.querySelector('[data-cp-mini-body]')?.addEventListener('click', (e) => {
      if (!bar.classList.contains('is-expanded')) return;
      if (bar.dataset.suppressTap === '1') return;
      if (e.target.closest('button, input, a, [data-cp-mini-panel]')) return;
      collapseMiniPlayer();
    });

    const seek = bar.querySelector('[data-cp-mini-seek]');
    seek?.addEventListener('pointerdown', (e) => e.stopPropagation());
    seek?.addEventListener('input', () => {
      seek.dataset.seeking = '1';
    });
    seek?.addEventListener('change', () => {
      seek.dataset.seeking = '0';
      const audio = resolveAudio();
      const d = audio?.duration;
      if (!audio || !Number.isFinite(d) || d <= 0) return;
      audio.currentTime = (Number(seek.value) / 1000) * d;
      syncMiniFromMedia(audio);
    });
  }

  function bindMiniOnce(media) {
    if (!media) return;
    setSharedAudioRef(media);
    if (miniBound) return;
    miniBound = true;
    const bar = ensureMiniPlayer();
    wireMiniUi(bar);

    const resolveAudio = () => getSharedAudio() || media;
    const seek = bar.querySelector('[data-cp-mini-seek]');

    media.addEventListener('timeupdate', () => {
      if (seek?.dataset.seeking === '1') return;
      if (bar.dataset.dragging === '1') {
        // Update times/seek only — skip layout/position
        const audio = resolveAudio();
        if (!audio) return;
        const d = audio.duration;
        const t = audio.currentTime || 0;
        if (seek && Number.isFinite(d) && d > 0) {
          seek.value = String(Math.round((t / d) * 1000));
        }
        const elapsed = bar.querySelector('[data-cp-mini-elapsed]');
        const remain = bar.querySelector('[data-cp-mini-remain]');
        if (elapsed) elapsed.textContent = formatTime(t);
        if (remain) remain.textContent = Number.isFinite(d) ? '−' + formatTime(Math.max(0, d - t)) : '−0:00';
        return;
      }
      syncMiniFromMedia(resolveAudio());
    });
    media.addEventListener('play', () => syncMiniFromMedia(resolveAudio()));
    media.addEventListener('pause', () => syncMiniFromMedia(resolveAudio()));
    media.addEventListener('ended', () => {
      playQueueIndex(queueIndex + 1);
      try {
        if (typeof window.onMediaQueueAdvance === 'function') {
          window.onMediaQueueAdvance(queueIndex, queue.length);
        }
      } catch (e) {}
    });
  }

  /**
   * Switch queue track. Does NOT call pauseAllMusic (that clears src and breaks next).
   * Stops at ends — no wrap. No-ops when i is out of range (including ended at last track).
   */
  function playQueueIndex(i) {
    if (!queue.length) return;
    if (i < 0 || i >= queue.length) return;
    if (quietBlocked()) return;
    queueIndex = i;
    const item = queue[i];
    if (!item?.previewUrl) return;

    const audio = getSharedAudio() || window.__chaupaalSharedAudio;
    if (!audio) return;

    audio.dataset.cpTitle = item.title || 'Track';
    audio.dataset.cpArtist = item.artist || '';
    try {
      audio.removeAttribute('src');
      audio.load();
    } catch (e) {}
    audio.src = item.previewUrl;
    try {
      audio.load();
    } catch (e) {}
    audio.play().catch(() => {});
    ensureMiniPlayer().classList.remove('hidden');
    syncMiniFromMedia(audio);
    try {
      if (typeof syncMusicCardFromTrack === 'function') syncMusicCardFromTrack(item);
      else if (typeof MusicCard?.syncFromTrack === 'function') MusicCard.syncFromTrack(item);
    } catch (e) {}
  }

  function playMediaPrev() {
    if (queueIndex <= 0) return;
    playQueueIndex(queueIndex - 1);
  }

  function playMediaNext() {
    if (queueIndex < 0 || queueIndex >= queue.length - 1) return;
    playQueueIndex(queueIndex + 1);
  }

  /**
   * Enqueue tracks for mini-player next/prev (does not auto-start unless opts.play).
   * @param {{ title: string, artist?: string, previewUrl: string, thumb?: string }[]} tracks
   * @param {{ startIndex?: number, play?: boolean }} [opts]
   */
  function setMediaQueue(tracks, opts = {}) {
    queue = Array.isArray(tracks) ? tracks.filter((t) => t && t.previewUrl) : [];
    queueIndex = typeof opts.startIndex === 'number' ? opts.startIndex : 0;
    if (queueIndex < 0 || queueIndex >= queue.length) queueIndex = queue.length ? 0 : -1;
    if (opts.play && queue[queueIndex]) playQueueIndex(queueIndex);
    else {
      const audio = getSharedAudio() || window.__chaupaalSharedAudio;
      if (audio) syncMiniFromMedia(audio);
    }
  }

  /** Append playable tracks for silent radio refill (no restart). */
  function appendMediaQueue(tracks) {
    const extra = Array.isArray(tracks) ? tracks.filter((t) => t && t.previewUrl) : [];
    if (!extra.length) return queue.length;
    const seen = new Set(queue.map((t) => `${t.title}|${t.artist || ''}`));
    extra.forEach((t) => {
      const k = `${t.title}|${t.artist || ''}`;
      if (seen.has(k)) return;
      seen.add(k);
      queue.push(t);
    });
    return queue.length;
  }

  function getMediaQueueState() {
    return {
      length: queue.length,
      index: queueIndex,
      remaining: queue.length > 0 && queueIndex >= 0 ? queue.length - queueIndex - 1 : 0,
    };
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

  /**
   * SINGLE resolve path for "give me a playable preview URL for this track".
   * Used by chat music cards, the mini-player/queue, and Mehfil in-call music
   * so the JioSaavn-vs-iTunes preference logic lives in exactly one place.
   *
   * Rule (matches server-lib/music.js): keep an existing/JioSaavn preview if we
   * already have one; only hit music_resolve (iTunes) when there is no URL.
   *
   * @param {{ title?: string, artist?: string, previewUrl?: string|null,
   *   thumbnail?: string, source?: string }} track
   * @returns {Promise<object>} track with best-effort previewUrl/source
   */
  async function resolvePlayableUrl(track) {
    if (!track) return track;
    if (track.previewUrl) return track;
    if (!track.title || typeof apiFetch !== 'function') return track;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'music_resolve', title: track.title, artist: track.artist || '' },
      });
      if (envelope?.ok && envelope.data?.previewUrl) {
        return {
          ...track,
          previewUrl: envelope.data.previewUrl,
          source: envelope.data.source || 'itunes',
          thumbnail: track.thumbnail || envelope.data.song?.thumbnail || '',
        };
      }
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({
          feature: 'music_resolve',
          message: e?.message || String(e),
          stack: e?.stack || '',
        });
      }
    }
    return track;
  }

  window.formatMediaTime = formatTime;
  window.mediaControlsHtml = controlsHtml;
  window.bindMediaControls = bindMediaControls;
  window.enhanceMediaIn = enhanceMediaIn;
  window.setMediaQueue = setMediaQueue;
  window.appendMediaQueue = appendMediaQueue;
  window.getMediaQueueState = getMediaQueueState;
  window.syncMiniPlayer = syncMiniFromMedia;
  window.playMediaPrev = playMediaPrev;
  window.playMediaNext = playMediaNext;
  window.resolvePlayableUrl = resolvePlayableUrl;
  window.MediaPlayback = {
    resolvePlayableUrl,
    setMediaQueue,
    appendMediaQueue,
    getMediaQueueState,
    playPrev: playMediaPrev,
    playNext: playMediaNext,
  };
})();
