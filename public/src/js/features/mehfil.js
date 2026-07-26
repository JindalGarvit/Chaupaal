/**
 * Mehfil — in-chat audio/video room (Part 2 Phase 5).
 * Silent join (Teams-like), cam/mic OFF by default, synced media via RTDB.
 * Agora token from /api/media-config action agora_token.
 * Feature flag: mehfil (default off until configured).
 */
(function () {
  'use strict';

  const AGORA_CDN = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js';
  const YT_API = 'https://www.youtube.com/iframe_api';
  const REACTIONS = ['🔥', '👏', '😂', '❤️', '😮', '🎉', '👍', '🙏'];
  const STICKERS = ['🏠', '☕', '🏏', '🎵', '🌧️', '✨', '🪷', '🪔'];

  let client = null;
  let localAudio = null;
  let localVideo = null;
  let localScreen = null;
  let localUid = null;
  let camWanted = false;
  let activeChatId = null;
  let rtdbUnsubs = [];
  let ytPlayer = null;
  let mediaHost = false;
  let overlayEl = null;
  let chromeTimer = null;
  const CHROME_DIM_MS = 3500;
  const SPEAK_LEVEL = 8;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function channelForChat(chatId) {
    return ('mh_' + String(chatId || '').replace(/[^a-zA-Z0-9_-]/g, '')).slice(0, 64);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src || s.src.includes(src.split('/').pop()))) {
        resolve();
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('script_load_failed'));
      document.head.appendChild(el);
    });
  }

  async function ensureAgora() {
    if (window.AgoraRTC) return window.AgoraRTC;
    await loadScript(AGORA_CDN);
    return window.AgoraRTC;
  }

  /** Styles live in /src/styles/mehfil.css (token-driven). Keep a no-op for older call sites. */
  function ensureStyles() {}

  function setMehfilStatus(text, tone) {
    const status = overlayEl?.querySelector('[data-mehfil-status]');
    if (!status) return;
    status.textContent = text || '';
    status.classList.toggle('is-live', tone === 'live');
    status.classList.toggle('is-warn', tone === 'warn');
  }

  function updateWaitingState() {
    if (!overlayEl) return;
    const stage = overlayEl.querySelector('[data-mehfil-stage]');
    const waiting = overlayEl.querySelector('[data-mehfil-waiting]');
    if (!stage || !waiting) return;
    const remotes = stage.querySelectorAll('.mehfil-tile:not(.mehfil-tile--self)').length;
    const blocked = !!stage.querySelector('.mehfil-disabled');
    waiting.hidden = blocked || remotes > 0;
  }

  function syncSheetOpenClass() {
    if (!overlayEl) return;
    const open = !!overlayEl.querySelector('.mehfil-sheet.is-open, .mehfil-more-menu.is-open');
    overlayEl.classList.toggle('mehfil-sheet-open', open);
    if (open) {
      overlayEl.classList.remove('mehfil-chrome-dim');
      clearTimeout(chromeTimer);
      chromeTimer = null;
    } else {
      pokeChrome();
    }
  }

  function pokeChrome() {
    if (!overlayEl) return;
    overlayEl.classList.remove('mehfil-chrome-dim');
    clearTimeout(chromeTimer);
    chromeTimer = null;
    if (overlayEl.classList.contains('mehfil-sheet-open')) return;
    chromeTimer = setTimeout(() => {
      overlayEl?.classList.add('mehfil-chrome-dim');
    }, CHROME_DIM_MS);
  }

  function closeCallSheets(except) {
    if (!overlayEl) return;
    const map = {
      media: '[data-mehfil-media]',
      reacts: '[data-mehfil-reacts]',
      stickers: '[data-mehfil-stickers]',
      more: '[data-mehfil-more]',
    };
    Object.entries(map).forEach(([key, sel]) => {
      if (key === except) return;
      overlayEl.querySelector(sel)?.classList.remove('is-open');
    });
    overlayEl.querySelector('[data-mehfil-more-btn]')?.classList.toggle('is-open', except === 'more');
    syncSheetOpenClass();
  }

  function toggleCallSheet(which) {
    if (!overlayEl) return;
    const sel =
      which === 'media'
        ? '[data-mehfil-media]'
        : which === 'reacts'
          ? '[data-mehfil-reacts]'
          : which === 'stickers'
            ? '[data-mehfil-stickers]'
            : '[data-mehfil-more]';
    const panel = overlayEl.querySelector(sel);
    if (!panel) return;
    const willOpen = !panel.classList.contains('is-open');
    closeCallSheets(willOpen ? which : null);
    if (willOpen) panel.classList.add('is-open');
    overlayEl.querySelector('[data-mehfil-more-btn]')?.classList.toggle('is-open', which === 'more' && willOpen);
    syncSheetOpenClass();
    pokeChrome();
  }

  function setMicUi(live) {
    const btn = overlayEl?.querySelector('[data-mehfil-mic]');
    btn?.classList.toggle('is-live', live);
    btn?.classList.toggle('is-muted', !live);
  }

  function setCamUi(live) {
    const btn = overlayEl?.querySelector('[data-mehfil-cam]');
    btn?.classList.toggle('is-live', live);
    btn?.classList.toggle('is-off', !live);
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    tile?.classList.toggle('is-cam-off', !live && !localScreen);
  }

  function setShareUi(sharing) {
    const btn = overlayEl?.querySelector('[data-mehfil-share]');
    btn?.classList.toggle('is-live', sharing);
    const label = btn?.querySelector('[data-mehfil-share-label]');
    if (label) label.textContent = sharing ? 'Stop share' : 'Share';
    overlayEl?.querySelector('[data-mehfil-local-video]')?.classList.toggle('is-screen', sharing);
  }

  function renderLocalPlaceholder(text) {
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (!tile) return;
    tile.classList.remove('is-screen');
    tile.innerHTML = `<span class="mehfil-tile-placeholder">${esc(
      text || 'Camera off'
    )}</span><div class="mehfil-tile-label">You</div>`;
  }

  function playLocalOnTile(track, label) {
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (!tile || !track) return;
    tile.innerHTML = `<div class="mehfil-tile-label">${esc(label || 'You')}</div>`;
    track.play(tile);
  }

  function applyVolumeIndicators(volumes) {
    if (!overlayEl || !Array.isArray(volumes)) return;
    const byUid = new Map(volumes.map((v) => [String(v.uid), Number(v.level) || 0]));
    overlayEl.querySelectorAll('.mehfil-tile').forEach((tile) => {
      let level = 0;
      if (tile.classList.contains('mehfil-tile--self')) {
        if (localUid != null) level = byUid.get(String(localUid)) || 0;
      } else if (tile.dataset.uid != null) {
        level = byUid.get(String(tile.dataset.uid)) || 0;
      }
      tile.classList.toggle('is-speaking', level >= SPEAK_LEVEL);
    });
  }

  async function closeCameraTrack() {
    if (!localVideo) return;
    try {
      await client?.unpublish([localVideo]);
    } catch (e) {}
    try {
      localVideo.close();
    } catch (e) {}
    localVideo = null;
  }

  async function closeScreenTrack() {
    if (!localScreen) return;
    try {
      await client?.unpublish([localScreen]);
    } catch (e) {}
    try {
      localScreen.close();
    } catch (e) {}
    localScreen = null;
    setShareUi(false);
  }

  async function publishCamera() {
    if (!client || !window.AgoraRTC) return;
    await closeScreenTrack();
    if (!localVideo) {
      localVideo = await window.AgoraRTC.createCameraVideoTrack();
      await client.publish([localVideo]);
    }
    playLocalOnTile(localVideo, 'You');
    setCamUi(true);
  }

  function rtdbRef(path) {
    if (typeof rtdb === 'undefined' || !rtdb) return null;
    return rtdb.ref(path);
  }

  function clearRtdb() {
    rtdbUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    rtdbUnsubs = [];
  }

  function showReactionBurst(emoji) {
    if (!overlayEl) return;
    const el = document.createElement('div');
    el.className = 'mehfil-float-react';
    el.textContent = emoji;
    overlayEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  async function publishMediaState(patch) {
    if (!activeChatId || !currentUser?.uid) return;
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    if (!ref) return;
    await ref.update({
      ...patch,
      by: currentUser.uid,
      at: Date.now(),
    });
  }

  function bindMediaSync() {
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    if (!ref) return;
    const handler = (snap) => {
      const m = snap.val();
      if (!m || m.by === currentUser?.uid) return;
      applyRemoteMedia(m);
    };
    ref.on('value', handler);
    rtdbUnsubs.push(() => ref.off('value', handler));

    const reactRef = rtdbRef(`mehfil/${activeChatId}/reactions`);
    if (reactRef) {
      const onReact = (snap) => {
        const v = snap.val();
        if (v?.emoji) showReactionBurst(v.emoji);
      };
      reactRef.limitToLast(1).on('child_added', onReact);
      rtdbUnsubs.push(() => reactRef.off('child_added', onReact));
    }
  }

  function applyRemoteMedia(m) {
    const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
    if (nowEl) {
      nowEl.textContent = m.title
        ? `Now playing: ${m.title}`
        : m.type === 'youtube'
          ? 'YouTube in Mehfil'
          : 'Shared media';
    }
    if (m.type === 'youtube' && m.id) {
      ensureYtPlayer(m.id, !!m.playing, Number(m.t) || 0);
    } else if (m.type === 'music' && m.previewUrl) {
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
      try {
        const a = new Audio(m.previewUrl);
        a.dataset.mehfilShared = '1';
        if (m.playing !== false) a.play().catch(() => {});
        window.__mehfilSharedAudio = a;
      } catch (e) {}
    }
    // Media lives in overflow — surface the sheet when someone else starts playback
    if (overlayEl && !overlayEl.querySelector('[data-mehfil-media]')?.classList.contains('is-open')) {
      closeCallSheets('media');
      overlayEl.querySelector('[data-mehfil-media]')?.classList.add('is-open');
      syncSheetOpenClass();
    }
  }

  function ensureYtPlayer(videoId, play, startAt) {
    const host = overlayEl?.querySelector('[data-mehfil-yt]');
    if (!host) return;
    const boot = () => {
      if (!window.YT || !window.YT.Player) return;
      if (ytPlayer) {
        try {
          const cur = ytPlayer.getVideoData?.()?.video_id;
          if (cur !== videoId) ytPlayer.loadVideoById({ videoId, startSeconds: startAt || 0 });
          else if (startAt) ytPlayer.seekTo(startAt, true);
          if (play) ytPlayer.playVideo();
          else ytPlayer.pauseVideo();
        } catch (e) {}
        return;
      }
      ytPlayer = new window.YT.Player(host, {
        videoId,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: (e) => {
            if (startAt) e.target.seekTo(startAt, true);
            if (play) e.target.playVideo();
          },
        },
      });
    };
    if (window.YT && window.YT.Player) boot();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        boot();
      };
      loadScript(YT_API).catch(() => {});
    }
  }

  async function searchAndPlay(query) {
    const q = String(query || '').trim();
    if (!q) return;
    // Prefer YouTube ID paste
    const ytMatch = q.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{6,})/) || (q.length === 11 && /^[a-zA-Z0-9_-]+$/.test(q) ? [0, q] : null);
    if (ytMatch) {
      const id = ytMatch[1];
      mediaHost = true;
      ensureYtPlayer(id, true, 0);
      await publishMediaState({ type: 'youtube', id, playing: true, t: 0, title: 'YouTube' });
      return;
    }
    if (typeof apiFetch !== 'function') return;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'music_search', query: q, limit: 5 },
      });
      const song = envelope?.data?.results?.[0];
      if (!song?.previewUrl) {
        if (typeof showToast === 'function') showToast('No playable preview — paste a YouTube link');
        return;
      }
      mediaHost = true;
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
      const a = new Audio(song.previewUrl);
      window.__mehfilSharedAudio = a;
      await a.play().catch(() => {});
      await publishMediaState({
        type: 'music',
        previewUrl: song.previewUrl,
        title: `${song.title} — ${song.artist || ''}`.trim(),
        playing: true,
        t: 0,
      });
      const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
      if (nowEl) nowEl.textContent = `Now playing: ${song.title}`;
    } catch (e) {
      if (typeof showToast === 'function') showToast('Media search failed');
    }
  }

  async function leaveMehfil() {
    clearTimeout(chromeTimer);
    chromeTimer = null;
    try {
      if (localAudio) {
        localAudio.close();
        localAudio = null;
      }
      if (localVideo) {
        localVideo.close();
        localVideo = null;
      }
      if (localScreen) {
        localScreen.close();
        localScreen = null;
      }
      if (client) {
        await client.leave();
        client = null;
      }
    } catch (e) {}
    try {
      ytPlayer?.destroy?.();
    } catch (e) {}
    ytPlayer = null;
    try {
      window.__mehfilSharedAudio?.pause?.();
    } catch (e) {}
    clearRtdb();
    if (activeChatId && currentUser?.uid) {
      try {
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser.uid}`)?.remove();
      } catch (e) {}
    }
    activeChatId = null;
    localUid = null;
    camWanted = false;
    if (overlayEl) {
      if (typeof removeNavLayer === 'function') removeNavLayer(overlayEl);
      overlayEl.remove();
      overlayEl = null;
    }
  }

  async function toggleMic() {
    if (!localAudio || !client) return;
    const track = localAudio;
    // Agora local track: setEnabled
    const next = !(track.isPlaying || track.enabled !== false);
    try {
      await track.setEnabled(next);
      setMicUi(next);
    } catch (e) {
      try {
        if (next) await client.publish([track]);
        else await client.unpublish([track]);
        setMicUi(next);
      } catch (err) {}
    }
    pokeChrome();
  }

  async function toggleCam() {
    if (!client || !window.AgoraRTC) return;
    try {
      if (localScreen) {
        if (typeof showToast === 'function') showToast('Stop screen share to use camera');
        pokeChrome();
        return;
      }
      if (!localVideo) {
        camWanted = true;
        await publishCamera();
      } else {
        camWanted = false;
        await closeCameraTrack();
        renderLocalPlaceholder('Camera off');
        setCamUi(false);
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Camera unavailable');
    }
    pokeChrome();
  }

  async function flipCamera() {
    if (!client || !window.AgoraRTC) return;
    closeCallSheets(null);
    if (localScreen) {
      if (typeof showToast === 'function') showToast('Stop screen share to flip camera');
      return;
    }
    if (!localVideo) {
      if (typeof showToast === 'function') showToast('Turn camera on to flip');
      return;
    }
    try {
      const cams = await window.AgoraRTC.getCameras();
      if (!cams || cams.length < 2) {
        if (typeof showToast === 'function') showToast('No other camera found');
        return;
      }
      const curId = localVideo.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
      const idx = Math.max(
        0,
        cams.findIndex((c) => c.deviceId === curId)
      );
      const next = cams[(idx + 1) % cams.length];
      await localVideo.setDevice(next.deviceId);
      if (typeof showToast === 'function') showToast('Camera flipped');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Couldn’t flip camera');
    }
    pokeChrome();
  }

  async function toggleScreenShare() {
    if (!client || !window.AgoraRTC) return;
    closeCallSheets(null);
    try {
      if (localScreen) {
        await closeScreenTrack();
        if (camWanted) {
          await publishCamera();
        } else {
          renderLocalPlaceholder('Camera off');
          setCamUi(false);
        }
        pokeChrome();
        return;
      }
      // Agora: one published video track — replace camera with screen (video only)
      await closeCameraTrack();
      setCamUi(false);
      const trackOrPair = await window.AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1' },
        'disable'
      );
      localScreen = Array.isArray(trackOrPair) ? trackOrPair[0] : trackOrPair;
      localScreen.on?.('track-ended', () => {
        (async () => {
          if (!localScreen) return;
          await closeScreenTrack();
          if (camWanted) {
            try {
              await publishCamera();
            } catch (err) {}
          } else {
            renderLocalPlaceholder('Camera off');
            setCamUi(false);
          }
        })().catch(() => {});
      });
      await client.publish([localScreen]);
      playLocalOnTile(localScreen, 'You · screen');
      setShareUi(true);
      if (typeof showToast === 'function') showToast('Sharing screen');
    } catch (e) {
      localScreen = null;
      setShareUi(false);
      if (camWanted) {
        try {
          await publishCamera();
        } catch (err) {}
      } else {
        renderLocalPlaceholder('Camera off');
        setCamUi(false);
      }
      const msg =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|cancelled|canceled/i.test(String(e?.message || e))
          ? 'Screen share cancelled'
          : 'Screen share unavailable on this device';
      if (typeof showToast === 'function') showToast(msg);
    }
    pokeChrome();
  }

  async function openMehfil(chat) {
    if (!chat || chat.isChaupaal || (typeof isChaupaalChat === 'function' && isChaupaalChat(chat))) {
      if (typeof showToast === 'function') showToast('Mehfil isn’t available in Chaupaal chat');
      return;
    }
    const chatId = chat.firestoreId || chat.id;
    if (!chatId) return;

    // Feature flag — default off until Agora configured / rolled out
    let enabled = false;
    try {
      if (typeof isFeatureEnabled === 'function') {
        enabled = await isFeatureEnabled('mehfil', { defaultValue: false });
      }
    } catch (e) {}

    ensureStyles();
    document.getElementById('mehfilOverlay')?.remove();
    const device = document.querySelector('.device') || document.body;
    const el = document.createElement('div');
    el.id = 'mehfilOverlay';
    el.className = 'mehfil-overlay';
    el.dataset.navManaged = '1';
    el.innerHTML = `
      <div class="mehfil-top">
        <div class="mehfil-title">Mehfil · ${esc(chat.name || 'Chat')}</div>
        <div class="mehfil-status" data-mehfil-status>Joining…</div>
      </div>
      <div class="mehfil-stage" data-mehfil-stage>
        <div class="mehfil-tile mehfil-tile--self is-cam-off" data-mehfil-local-video>
          <span class="mehfil-tile-placeholder">Camera off</span>
          <div class="mehfil-tile-label">You</div>
        </div>
        <div class="mehfil-waiting" data-mehfil-waiting>
          <div class="mehfil-waiting-title">Waiting to start</div>
          <div class="mehfil-waiting-msg">Others will appear here when they join this Mehfil.</div>
        </div>
      </div>
      <div class="mehfil-sheet mehfil-media-sheet" data-mehfil-media>
        <div class="mehfil-now" data-mehfil-now>Search a song or paste a YouTube link</div>
        <div id="mehfilYtHost" class="mehfil-yt" data-mehfil-yt></div>
        <div class="mehfil-media-search">
          <input type="search" placeholder="Song or YouTube link…" data-mehfil-q enterkeyhint="search">
          <button type="button" data-mehfil-play>Play</button>
        </div>
      </div>
      <div class="mehfil-sheet mehfil-react-tray" data-mehfil-reacts>
        ${REACTIONS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <div class="mehfil-sheet mehfil-sticker-tray" data-mehfil-stickers>
        ${STICKERS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <div class="mehfil-more-menu" data-mehfil-more>
        <button type="button" class="mehfil-more-item" data-mehfil-react-btn>
          <span class="icon" aria-hidden="true">😀</span>
          Reactions
        </button>
        <button type="button" class="mehfil-more-item" data-mehfil-sticker-btn>
          <span class="icon" aria-hidden="true">🪷</span>
          Stickers
        </button>
        <button type="button" class="mehfil-more-item" data-mehfil-media-btn>
          <span class="icon" aria-hidden="true">🎵</span>
          Music
        </button>
        <button type="button" class="mehfil-more-item" data-mehfil-flip title="Flip camera">
          <span class="icon" aria-hidden="true">🔄</span>
          Flip
        </button>
        <button type="button" class="mehfil-more-item" data-mehfil-share title="Share screen">
          <span class="icon" aria-hidden="true">🖥️</span>
          <span data-mehfil-share-label>Share</span>
        </button>
        <button type="button" class="mehfil-more-item" data-mehfil-ask title="Ask Chaupaal">
          <span class="icon" aria-hidden="true"><span class="mehfil-ai-mark">🏠</span></span>
          Ask
        </button>
      </div>
      <div class="mehfil-dock">
        <div class="mehfil-dock-primary">
          <button type="button" class="mehfil-ctrl is-muted" data-mehfil-mic title="Mic (off by default)" aria-label="Toggle microphone">🎤</button>
          <button type="button" class="mehfil-ctrl is-off" data-mehfil-cam title="Camera (off by default)" aria-label="Toggle camera">📷</button>
          <button type="button" class="mehfil-ctrl" data-mehfil-more-btn title="More" aria-label="More call actions" aria-haspopup="true">⋯</button>
        </div>
        <button type="button" class="mehfil-leave" data-mehfil-leave title="Leave call" aria-label="Leave call">Leave</button>
      </div>`;
    device.appendChild(el);
    overlayEl = el;
    if (typeof pushNavLayer === 'function') pushNavLayer(el, () => leaveMehfil());

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mehfil-dock, .mehfil-sheet, .mehfil-more-menu, .mehfil-top')) {
        pokeChrome();
        return;
      }
      if (el.classList.contains('mehfil-chrome-dim')) {
        pokeChrome();
        return;
      }
      pokeChrome();
    });
    pokeChrome();

    el.querySelector('[data-mehfil-leave]')?.addEventListener('click', leaveMehfil);
    el.querySelector('[data-mehfil-mic]')?.addEventListener('click', toggleMic);
    el.querySelector('[data-mehfil-cam]')?.addEventListener('click', toggleCam);
    el.querySelector('[data-mehfil-more-btn]')?.addEventListener('click', () => toggleCallSheet('more'));
    el.querySelector('[data-mehfil-react-btn]')?.addEventListener('click', () => toggleCallSheet('reacts'));
    el.querySelector('[data-mehfil-sticker-btn]')?.addEventListener('click', () => toggleCallSheet('stickers'));
    el.querySelector('[data-mehfil-media-btn]')?.addEventListener('click', () => toggleCallSheet('media'));
    el.querySelector('[data-mehfil-flip]')?.addEventListener('click', flipCamera);
    el.querySelector('[data-mehfil-share]')?.addEventListener('click', toggleScreenShare);
    el.querySelectorAll('[data-mehfil-reacts] button, [data-mehfil-stickers] button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const emoji = btn.dataset.emoji;
        showReactionBurst(emoji);
        if (activeChatId) {
          try {
            await rtdbRef(`mehfil/${activeChatId}/reactions`)?.push({
              emoji,
              by: currentUser?.uid || null,
              at: Date.now(),
            });
          } catch (e) {}
        }
        pokeChrome();
      });
    });
    el.querySelector('[data-mehfil-play]')?.addEventListener('click', () => {
      searchAndPlay(el.querySelector('[data-mehfil-q]')?.value);
    });
    el.querySelector('[data-mehfil-q]')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchAndPlay(e.target.value);
      }
    });
    el.querySelector('[data-mehfil-ask]')?.addEventListener('click', () => {
      closeCallSheets(null);
      // Chaupaal AI mark: red rounded square with charpai house — reviewable design choice
      if (typeof openAiKeyboard === 'function') {
        const fake = document.createElement('textarea');
        fake.style.position = 'fixed';
        fake.style.left = '-9999px';
        document.body.appendChild(fake);
        openAiKeyboard(fake, 'Mehfil');
        setTimeout(() => fake.remove(), 500);
      } else if (typeof showToast === 'function') {
        showToast('Ask Chaupaal');
      }
    });

    if (!enabled) {
      // Still show shell so UX exists; join blocked until flag + Agora env
      const stage = el.querySelector('[data-mehfil-stage]');
      if (stage) {
        stage.innerHTML = `<div class="mehfil-disabled">Mehfil is ready to join once Agora is configured and the <code>mehfil</code> feature flag is on.<br><br>Synced media, reactions, and Ask Chaupaal work in this room preview.</div>`;
      }
      setMehfilStatus('Preview', 'warn');
      activeChatId = chatId;
      bindMediaSync();
      return;
    }

    if (typeof apiFetch !== 'function') {
      if (typeof showToast === 'function') showToast('Mehfil unavailable');
      return;
    }

    let tokenPayload;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'agora_token', channel: channelForChat(chatId), uid: currentUser?.uid },
      });
      tokenPayload = envelope?.data;
    } catch (e) {
      tokenPayload = null;
    }

    if (!tokenPayload?.configured || !tokenPayload.token) {
      const stage = el.querySelector('[data-mehfil-stage]');
      if (stage) {
        stage.innerHTML = `<div class="mehfil-disabled">Agora isn’t configured yet. Add <code>AGORA_APP_ID</code> and <code>AGORA_APP_CERTIFICATE</code> on Vercel, then reopen Mehfil.<br><br>You can still search synced media in this room.</div>`;
      }
      setMehfilStatus('Setup needed', 'warn');
      activeChatId = chatId;
      bindMediaSync();
      return;
    }

    try {
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
      const AgoraRTC = await ensureAgora();
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      camWanted = false;
      localUid = tokenPayload.uid != null ? tokenPayload.uid : null;

      client.on('connection-state-change', (cur) => {
        if (cur === 'RECONNECTING' || cur === 'DISCONNECTING') {
          setMehfilStatus('Reconnecting…', 'warn');
        } else if (cur === 'CONNECTED') {
          setMehfilStatus('In call', 'live');
        }
      });

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          const stage = el.querySelector('[data-mehfil-stage]');
          let tile = el.querySelector(`[data-uid="${user.uid}"]`);
          if (!tile && stage) {
            tile = document.createElement('div');
            tile.className = 'mehfil-tile';
            tile.dataset.uid = user.uid;
            tile.innerHTML = `<div class="mehfil-tile-label">${esc(String(user.uid))}</div>`;
            stage.appendChild(tile);
          }
          user.videoTrack?.play(tile);
          updateWaitingState();
          setMehfilStatus('In call', 'live');
        }
        if (mediaType === 'audio') user.audioTrack?.play();
      });

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType !== 'video') return;
        const tile = el.querySelector(`[data-uid="${user.uid}"]`);
        if (tile && !user.hasAudio) {
          tile.remove();
        } else if (tile) {
          tile.querySelector('video')?.remove();
          if (!tile.querySelector('.mehfil-tile-placeholder')) {
            const ph = document.createElement('span');
            ph.className = 'mehfil-tile-placeholder';
            ph.textContent = 'Camera off';
            tile.prepend(ph);
          }
        }
        updateWaitingState();
      });

      client.on('user-left', (user) => {
        el.querySelector(`[data-uid="${user.uid}"]`)?.remove();
        updateWaitingState();
        const remotes = el.querySelectorAll('.mehfil-tile:not(.mehfil-tile--self)').length;
        if (!remotes) setMehfilStatus('Connected', 'live');
      });

      client.on('volume-indicator', (volumes) => applyVolumeIndicators(volumes));

      await client.join(tokenPayload.appId, tokenPayload.channel, tokenPayload.token, tokenPayload.uid);
      if (localUid == null) localUid = client.uid;
      try {
        client.enableAudioVolumeIndicator();
      } catch (e) {}

      // Mic/cam OFF by default — create mic track muted
      localAudio = await AgoraRTC.createMicrophoneAudioTrack();
      await localAudio.setEnabled(false);
      await client.publish([localAudio]);
      setMicUi(false);
      setCamUi(false);
      setShareUi(false);
      setMehfilStatus('Connected', 'live');
      updateWaitingState();
      activeChatId = chatId;
      try {
        await rtdbRef(`mehfil/${chatId}/participants/${currentUser.uid}`)?.set({
          at: Date.now(),
          name: userProfile?.name || digitalProfile?.displayName || 'Member',
        });
        rtdbRef(`mehfil/${chatId}/participants/${currentUser.uid}`)?.onDisconnect()?.remove();
      } catch (e) {}
      bindMediaSync();
      if (typeof showToast === 'function') showToast('Joined Mehfil — mic & camera off');
    } catch (e) {
      console.warn('[mehfil] join', e);
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'mehfil_join', message: e?.message || String(e) });
      }
      if (typeof showToast === 'function') showToast('Couldn’t join Mehfil');
      setMehfilStatus('Couldn’t join', 'warn');
      activeChatId = chatId;
      bindMediaSync();
    }
  }

  // Agora integration boundary — failures report + recover shell (CONVENTIONS 4c)
  const guardMehfil = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openMehfil = guardMehfil('mehfil_open', openMehfil);
  window.leaveMehfil = guardMehfil('mehfil_leave', leaveMehfil);
})();
