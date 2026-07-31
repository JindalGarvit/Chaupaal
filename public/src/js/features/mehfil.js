/**
 * Mehfil — always-on in-chat voice/video room (Discord/Teams-like).
 * One persistent room per chat. Mic ON / cam OFF on join.
 * Agora via /api/media-config agora_token; media sync via RTDB mehfil/{chatId}.
 * Overlay is shell-contained; leave always goes through nav-stack / openLayer.
 * Feature flag: mehfil (default on). Unavailable in self-chat + Chaupaal AI chat.
 */
(function () {
  'use strict';

  const AGORA_CDN = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js';
  const YT_API = 'https://www.youtube.com/iframe_api';
  const REACTIONS = ['🔥', '👏', '😂', '❤️', '😮', '🎉', '👍', '🙏'];
  const STICKERS = ['🏠', '☕', '🏏', '🎵', '🌧️', '✨', '🪷', '🪔'];
  const SPEAK_LEVEL = 8;
  const CHROME_DIM_MS = 4000;
  const YT_RESYNC_MS = 5000;
  const PREF_KEY = 'chaupaal_mehfil_prefs';

  let client = null;
  let localAudio = null;
  let localVideo = null;
  let localScreen = null;
  let localUid = null;
  let camWanted = false;
  let micWanted = true;
  let activeChatId = null;
  let activeChat = null;
  let rtdbUnsubs = [];
  let ytPlayer = null;
  let applyingRemoteMedia = false;
  let overlayEl = null;
  let layerHandle = null;
  let chromeTimer = null;
  let ytResyncTimer = null;
  let leaving = false;
  let joinGeneration = 0;
  let presenceWatchers = new Map(); // chatId → Set<cb>
  let presenceUnsubs = new Map(); // chatId → unsub

  function tt(key, fallback, vars) {
    if (typeof t === 'function') {
      const s = t(key, vars || {});
      if (s && s !== key) return s;
    }
    let out = fallback || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        out = out.replace(`{{${k}}}`, v);
      });
    }
    return out;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readPrefs() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return { mic: true, cam: false };
      const p = JSON.parse(raw);
      return {
        mic: p.mic !== false,
        cam: !!p.cam,
      };
    } catch (e) {
      return { mic: true, cam: false };
    }
  }

  function writePrefs(patch) {
    try {
      const next = { ...readPrefs(), ...patch };
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function channelForChat(chatId) {
    return ('mh_' + String(chatId || '').replace(/[^a-zA-Z0-9_-]/g, '')).slice(0, 64);
  }

  function rtdbRef(path) {
    if (typeof rtdb === 'undefined' || !rtdb) return null;
    return rtdb.ref(path);
  }

  function mehfilMarkHtml(size) {
    const s = size || 22;
    return `<span class="mehfil-mark" style="--mehfil-mark-size:${s}px" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="${s}" height="${s}" focusable="false">
        <defs>
          <linearGradient id="mhg" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stop-color="#E63946"/><stop offset=".55" stop-color="#F4A261"/><stop offset="1" stop-color="#2A9D8F"/>
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#mhg)"/>
        <path d="M8 20c2.2-4.5 5-6.8 8-6.8S21.8 15.5 24 20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="12" cy="12.5" r="2.1" fill="#fff"/><circle cx="20" cy="12.5" r="2.1" fill="#fff"/>
        <path d="M10 22.5h12" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>
      </svg>
    </span>`;
  }

  function isMehfilBlockedChat(chat) {
    if (!chat) return true;
    if (typeof isSelfChat === 'function' && isSelfChat(chat)) return true;
    if (typeof isSelfChatRow === 'function' && isSelfChatRow(chat)) return true;
    if (chat.type === 'self' || chat.isSelf) return true;
    if (typeof isChaupaalChat === 'function' && isChaupaalChat(chat)) return true;
    if (typeof isChaupaalChatRow === 'function' && isChaupaalChatRow(chat)) return true;
    if (chat.isChaupaal || chat.type === 'chaupaal') return true;
    if (typeof chat.id === 'string' && chat.id.startsWith('chat_chaupaal_')) return true;
    if (typeof chat.id === 'string' && chat.id.startsWith('chat_self')) return true;
    return false;
  }

  function shellHost() {
    return document.getElementById('device') || document.querySelector('.device') || document.body;
  }

  function clearRtdb() {
    rtdbUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    rtdbUnsubs = [];
    if (ytResyncTimer) {
      clearInterval(ytResyncTimer);
      ytResyncTimer = null;
    }
  }

  async function ensureMehfilParticipant(chatId) {
    if (!chatId || !currentUser?.uid) return;
    try {
      const ref = rtdbRef(`mehfil/${chatId}/participants/${currentUser.uid}`);
      if (!ref) return;
      await ref.set({
        at: Date.now(),
        name: userProfile?.name || digitalProfile?.displayName || 'Member',
        muted: !micWanted,
        cam: !!camWanted,
      });
      ref.onDisconnect()?.remove();
    } catch (e) {}
  }

  function bindMembersList(chatId) {
    const host = overlayEl?.querySelector('[data-mehfil-members]');
    const ref = rtdbRef(`mehfil/${chatId}/participants`);
    if (!host || !ref) return;
    const paint = (snap) => {
      const val = snap.val() || {};
      const rows = Object.entries(val).map(([uid, meta]) => {
        const name = meta?.name || 'Member';
        const me = uid === currentUser?.uid;
        const muted = !!meta?.muted;
        return `<div class="mehfil-member${me ? ' is-me' : ''}${muted ? ' is-muted' : ''}">
          <span class="mehfil-member-dot"></span>
          <span class="mehfil-member-name">${esc(name)}${me ? ' · ' + tt('mehfil_you', 'you') : ''}</span>
          ${muted ? `<span class="mehfil-member-mic" title="${esc(tt('mehfil_muted', 'Muted'))}">🔇</span>` : ''}
        </div>`;
      });
      host.innerHTML = rows.length
        ? rows.join('')
        : `<div class="mehfil-member is-empty">${esc(tt('mehfil_empty_room', 'No one here yet'))}</div>`;
      updateWaitingState();
      updateAloneHint(Object.keys(val).length);
    };
    ref.on('value', paint);
    rtdbUnsubs.push(() => ref.off('value', paint));
  }

  function updateAloneHint(count) {
    const hint = overlayEl?.querySelector('[data-mehfil-alone]');
    if (!hint) return;
    const alone = !count || count <= 1;
    hint.hidden = !alone;
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
    const blocked = !!stage.querySelector('.mehfil-disabled, .mehfil-error');
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
    btn?.setAttribute('aria-pressed', live ? 'true' : 'false');
  }

  function setCamUi(live) {
    const btn = overlayEl?.querySelector('[data-mehfil-cam]');
    btn?.classList.toggle('is-live', live);
    btn?.classList.toggle('is-off', !live);
    btn?.setAttribute('aria-pressed', live ? 'true' : 'false');
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    tile?.classList.toggle('is-cam-off', !live && !localScreen);
  }

  function setShareUi(sharing) {
    const btn = overlayEl?.querySelector('[data-mehfil-share]');
    btn?.classList.toggle('is-live', sharing);
    const label = btn?.querySelector('[data-mehfil-share-label]');
    if (label) label.textContent = sharing ? tt('mehfil_stop_share', 'Stop share') : tt('mehfil_share', 'Share');
    overlayEl?.querySelector('[data-mehfil-local-video]')?.classList.toggle('is-screen', sharing);
  }

  function renderLocalPlaceholder(text) {
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (!tile) return;
    tile.classList.remove('is-screen');
    tile.innerHTML = `<span class="mehfil-tile-placeholder">${esc(
      text || tt('mehfil_cam_off', 'Camera off')
    )}</span><div class="mehfil-tile-label">${esc(tt('mehfil_you_label', 'You'))}</div>`;
  }

  function playLocalOnTile(track, label) {
    const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
    if (!tile || !track) return;
    tile.innerHTML = `<div class="mehfil-tile-label">${esc(label || tt('mehfil_you_label', 'You'))}</div>`;
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
    playLocalOnTile(localVideo, tt('mehfil_you_label', 'You'));
    setCamUi(true);
  }

  function showReactionBurst(emoji) {
    if (!overlayEl) return;
    if (typeof quietMode !== 'undefined' && quietMode) {
      /* still show visual, skip sound */
    }
    const el = document.createElement('div');
    el.className = 'mehfil-float-react';
    el.textContent = emoji;
    el.setAttribute('data-nav-ignore', '1');
    overlayEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  async function publishMediaState(patch) {
    if (!activeChatId || !currentUser?.uid) return;
    await ensureMehfilParticipant(activeChatId);
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    if (!ref) return;
    await ref.update({
      ...patch,
      by: currentUser.uid,
      at: Date.now(),
      wall: Date.now(),
    });
  }

  function bindMediaSync() {
    const ref = rtdbRef(`mehfil/${activeChatId}/media`);
    if (!ref) return;
    const handler = (snap) => {
      const m = snap.val();
      if (!m) return;
      if (m.by === currentUser?.uid && !applyingRemoteMedia) {
        // Still update now-playing chrome for self
        const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
        if (nowEl && m.title) nowEl.textContent = tt('mehfil_now_playing', 'Now playing: {{title}}', { title: m.title });
        return;
      }
      applyRemoteMedia(m);
    };
    ref.on('value', handler);
    rtdbUnsubs.push(() => ref.off('value', handler));

    // Periodic local clock skew check only — do not re-publish (avoids feedback loops).
    ytResyncTimer = setInterval(() => {
      if (!ytPlayer || !activeChatId || applyingRemoteMedia) return;
      try {
        const refMedia = rtdbRef(`mehfil/${activeChatId}/media`);
        refMedia?.once('value', (snap) => {
          const m = snap.val();
          if (!m || m.type !== 'youtube' || !m.id || m.by === currentUser?.uid) return;
          const curId = ytPlayer.getVideoData?.()?.video_id;
          if (curId !== m.id) return;
          const curT = ytPlayer.getCurrentTime?.() || 0;
          const target = Number(m.t) || 0;
          if (Math.abs(curT - target) > 2.5) {
            applyingRemoteMedia = true;
            try {
              ytPlayer.seekTo(target, true);
              if (m.playing) ytPlayer.playVideo();
              else ytPlayer.pauseVideo();
            } catch (e) {}
            setTimeout(() => {
              applyingRemoteMedia = false;
            }, 400);
          }
        });
      } catch (e) {}
    }, YT_RESYNC_MS);

    const reactRef = rtdbRef(`mehfil/${activeChatId}/reactions`);
    if (reactRef) {
      const onReact = (snap) => {
        const v = snap.val();
        if (v?.emoji) showReactionBurst(v.emoji);
      };
      reactRef.limitToLast(1).on('child_added', onReact);
      rtdbUnsubs.push(() => reactRef.off('child_added', onReact));
    }

    const chatRef = rtdbRef(`mehfil/${activeChatId}/chat`);
    const msgsEl = overlayEl?.querySelector('[data-mehfil-chat-msgs]');
    if (chatRef && msgsEl) {
      const onChat = (snap) => {
        const v = snap.val();
        if (!v?.text) return;
        const row = document.createElement('div');
        row.className = 'mehfil-chat-row' + (v.by === currentUser?.uid ? ' is-me' : '');
        row.innerHTML = `<span class="mehfil-chat-name">${esc(v.name || 'Someone')}</span><span class="mehfil-chat-text">${esc(v.text)}</span>`;
        msgsEl.appendChild(row);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      };
      chatRef.limitToLast(40).on('child_added', onChat);
      rtdbUnsubs.push(() => chatRef.off('child_added', onChat));
    }
  }

  function applyRemoteMedia(m) {
    applyingRemoteMedia = true;
    try {
      const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
      if (nowEl) {
        nowEl.textContent = m.title
          ? tt('mehfil_now_playing', 'Now playing: {{title}}', { title: m.title })
          : m.type === 'youtube'
            ? tt('mehfil_yt_in_room', 'YouTube in Mehfil')
            : tt('mehfil_shared_media', 'Shared media');
      }
      if (m.type === 'youtube' && m.id) {
        ensureYtPlayer(m.id, !!m.playing, Number(m.t) || 0);
      } else if (m.type === 'music' && m.previewUrl) {
        if (typeof quietMode !== 'undefined' && quietMode) return;
        if (typeof pauseAllMusic === 'function') pauseAllMusic();
        try {
          window.__mehfilSharedAudio?.pause?.();
          const a = new Audio(m.previewUrl);
          a.dataset.mehfilShared = '1';
          if (m.playing !== false) a.play().catch(() => {});
          window.__mehfilSharedAudio = a;
        } catch (e) {}
      }
      if (overlayEl && m.type && !overlayEl.querySelector('[data-mehfil-media]')?.classList.contains('is-open')) {
        closeCallSheets('media');
        overlayEl.querySelector('[data-mehfil-media]')?.classList.add('is-open');
        syncSheetOpenClass();
      }
    } finally {
      setTimeout(() => {
        applyingRemoteMedia = false;
      }, 400);
    }
  }

  function ensureYtPlayer(videoId, play, startAt) {
    const host = overlayEl?.querySelector('[data-mehfil-yt]');
    if (!host) return;
    const empty = overlayEl?.querySelector('[data-mehfil-yt-empty]');
    if (empty) empty.hidden = true;
    host.hidden = false;

    const boot = () => {
      if (!window.YT || !window.YT.Player) return;
      if (ytPlayer) {
        try {
          const cur = ytPlayer.getVideoData?.()?.video_id;
          if (cur !== videoId) ytPlayer.loadVideoById({ videoId, startSeconds: startAt || 0 });
          else {
            const curT = ytPlayer.getCurrentTime?.() || 0;
            if (Math.abs(curT - (startAt || 0)) > 1.5) ytPlayer.seekTo(startAt || 0, true);
          }
          if (play) ytPlayer.playVideo();
          else ytPlayer.pauseVideo();
        } catch (e) {}
        return;
      }
      try {
        ytPlayer = new window.YT.Player(host, {
          videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: (e) => {
              if (startAt) e.target.seekTo(startAt, true);
              if (play) e.target.playVideo();
            },
            onStateChange: (e) => {
              if (applyingRemoteMedia || !activeChatId) return;
              try {
                const st = e.data;
                const tSec = e.target.getCurrentTime?.() || 0;
                const id = e.target.getVideoData?.()?.video_id || videoId;
                if (st === window.YT.PlayerState.PLAYING) {
                  publishMediaState({ type: 'youtube', id, playing: true, t: tSec, title: 'YouTube' });
                } else if (st === window.YT.PlayerState.PAUSED) {
                  publishMediaState({ type: 'youtube', id, playing: false, t: tSec, title: 'YouTube' });
                }
              } catch (err) {}
            },
            onError: () => {
              if (empty) {
                empty.hidden = false;
                empty.textContent = tt(
                  'mehfil_yt_blocked',
                  'YouTube couldn’t load here — voice and camera still work.'
                );
              }
              host.hidden = true;
            },
          },
        });
      } catch (e) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = tt(
            'mehfil_yt_blocked',
            'YouTube couldn’t load here — voice and camera still work.'
          );
        }
      }
    };
    if (window.YT && window.YT.Player) boot();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        boot();
      };
      loadScript(YT_API).catch(() => {
        if (empty) {
          empty.hidden = false;
          empty.textContent = tt(
            'mehfil_yt_blocked',
            'YouTube couldn’t load here — voice and camera still work.'
          );
        }
      });
    }
  }

  async function stopCurrentMedia() {
    try {
      ytPlayer?.stopVideo?.();
    } catch (e) {}
    try {
      ytPlayer?.destroy?.();
    } catch (e) {}
    ytPlayer = null;
    try {
      window.__mehfilSharedAudio?.pause?.();
      window.__mehfilSharedAudio = null;
    } catch (e) {}
    const stageHost = overlayEl?.querySelector('[data-mehfil-yt]');
    if (stageHost) stageHost.innerHTML = '';
  }

  async function playYoutubeId(id, title) {
    await stopCurrentMedia();
    ensureYtPlayer(id, true, 0);
    await publishMediaState({
      type: 'youtube',
      id,
      playing: true,
      t: 0,
      title: title || 'YouTube',
    });
    const nowEl = overlayEl?.querySelector('[data-mehfil-now]');
    if (nowEl) nowEl.textContent = tt('mehfil_now_playing', 'Now playing: {{title}}', { title: title || 'YouTube' });
  }

  function showMehfilVideoPicker(results, query) {
    const rows = (results || [])
      .map(
        (r, i) =>
          `<button type="button" class="mehfil-yt-pick" data-yt-i="${i}">
            ${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : '<span class="mehfil-yt-pick-ph">▶</span>'}
            <span class="mehfil-yt-pick-meta">
              <strong>${esc(r.title || 'Video')}</strong>
              <small>${esc(r.channel || r.artist || '')}</small>
            </span>
          </button>`
      )
      .join('');
    const bodyHtml = `
      <div class="mehfil-yt-picks">${rows || `<div class="cp-empty">${tt('mehfil_no_preview', 'No playable preview — paste a YouTube link')}</div>`}</div>`;
    if (typeof openHalfSheet === 'function') {
      openHalfSheet({
        id: 'mehfilYtPickSheet',
        title: tt('mehfil_pick_video', 'Pick a video'),
        accent: 'baithak',
        bodyHtml,
        onMount: (sheet, close) => {
          sheet.querySelectorAll('[data-yt-i]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const r = results[Number(btn.dataset.ytI)];
              close();
              if (r?.id) await playYoutubeId(r.id, r.title);
              else if (r?.previewUrl) {
                await stopCurrentMedia();
                if (typeof pauseAllMusic === 'function') pauseAllMusic();
                const a = new Audio(r.previewUrl);
                window.__mehfilSharedAudio = a;
                if (!(typeof quietMode !== 'undefined' && quietMode)) await a.play().catch(() => {});
                await publishMediaState({
                  type: 'music',
                  previewUrl: r.previewUrl,
                  title: `${r.title || ''} — ${r.artist || ''}`.trim(),
                  playing: true,
                  t: 0,
                });
              }
            });
          });
        },
      });
      return;
    }
    // Fallback: take first result only if sheet unavailable
    const first = results?.[0];
    if (first?.id) playYoutubeId(first.id, first.title);
  }

  async function searchAndPlay(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const ytMatch =
      q.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{6,})/) ||
      (q.length === 11 && /^[a-zA-Z0-9_-]+$/.test(q) ? [0, q] : null);
    if (ytMatch) {
      await playYoutubeId(ytMatch[1], 'YouTube');
      return;
    }
    if (typeof apiFetch !== 'function') return;
    try {
      // Prefer YouTube search when available; fall back to music_search list
      let results = [];
      try {
        const ytEnv = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'youtube_search', query: q, limit: 8 },
        });
        results = (ytEnv?.data?.results || []).map((r) => ({
          id: r.id || r.videoId,
          title: r.title,
          channel: r.channelTitle || r.channel,
          thumb: r.thumb || r.thumbnail,
        })).filter((r) => r.id);
      } catch (e) {}
      if (!results.length) {
        const envelope = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'music_search', query: q, limit: 8 },
        });
        results = (envelope?.data?.results || []).map((song) => ({
          previewUrl: song.previewUrl,
          title: song.title,
          artist: song.artist,
          id: song.youtubeId || null,
          thumb: song.artwork || song.thumb,
        }));
      }
      if (!results.length) {
        if (typeof showToast === 'function') showToast(tt('mehfil_no_preview', 'No playable preview — paste a YouTube link'));
        return;
      }
      showMehfilVideoPicker(results, q);
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_media_fail', 'Media search failed'));
    }
  }

  function showStageError(message, opts) {
    const stage = overlayEl?.querySelector('[data-mehfil-stage]');
    if (!stage) return;
    const self = stage.querySelector('[data-mehfil-local-video]');
    const waiting = stage.querySelector('[data-mehfil-waiting]');
    stage.querySelectorAll('.mehfil-error, .mehfil-disabled').forEach((n) => n.remove());
    const box = document.createElement('div');
    box.className = opts?.fatal ? 'mehfil-error' : 'mehfil-disabled';
    box.innerHTML = `<p>${esc(message)}</p>
      ${
        opts?.retry
          ? `<button type="button" class="mehfil-retry" data-mehfil-retry>${esc(tt('mehfil_retry', 'Try again'))}</button>`
          : ''
      }
      <button type="button" class="mehfil-retry mehfil-retry--ghost" data-mehfil-leave-err>${esc(tt('mehfil_leave', 'Leave'))}</button>`;
    if (waiting) waiting.hidden = true;
    if (self) stage.insertBefore(box, self.nextSibling);
    else stage.appendChild(box);
    box.querySelector('[data-mehfil-retry]')?.addEventListener('click', () => {
      if (activeChat) openMehfil(activeChat);
    });
    box.querySelector('[data-mehfil-leave-err]')?.addEventListener('click', () => leaveMehfil());
    updateWaitingState();
  }

  /**
   * Hard teardown of media + DOM. Safe to call multiple times.
   * Does NOT touch history — callers use openLayer.close / leaveMehfil for that.
   */
  async function teardownMehfil(reason) {
    clearTimeout(chromeTimer);
    chromeTimer = null;
    clearRtdb();
    try {
      if (localAudio) {
        localAudio.close();
        localAudio = null;
      }
    } catch (e) {}
    try {
      if (localVideo) {
        localVideo.close();
        localVideo = null;
      }
    } catch (e) {}
    try {
      if (localScreen) {
        localScreen.close();
        localScreen = null;
      }
    } catch (e) {}
    try {
      if (client) {
        await client.leave();
        client.removeAllListeners?.();
        client = null;
      }
    } catch (e) {}
    // Silence immediately — stop YT + shared audio before DOM teardown
    try {
      ytPlayer?.stopVideo?.();
    } catch (e) {}
    try {
      ytPlayer?.destroy?.();
    } catch (e) {}
    ytPlayer = null;
    try {
      window.__mehfilSharedAudio?.pause?.();
      if (window.__mehfilSharedAudio) {
        window.__mehfilSharedAudio.src = '';
        window.__mehfilSharedAudio.load?.();
      }
      window.__mehfilSharedAudio = null;
    } catch (e) {}
    if (typeof pauseAllMusic === 'function') {
      try {
        pauseAllMusic();
      } catch (e) {}
    }
    if (activeChatId && currentUser?.uid) {
      try {
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser.uid}`)?.remove();
      } catch (e) {}
    }
    const el = overlayEl;
    overlayEl = null;
    activeChatId = null;
    activeChat = null;
    localUid = null;
    camWanted = false;
    micWanted = true;
    layerHandle = null;
    try {
      shellHost()?.classList.remove('is-mehfil-open');
    } catch (e) {}
    try {
      document.documentElement.classList.remove('mehfil-open');
    } catch (e) {}
    if (el?.isConnected) {
      try {
        el.remove();
      } catch (e) {}
    }
    try {
      if (typeof clearShellGlitches === 'function') clearShellGlitches(reason || 'mehfil_leave');
    } catch (e) {}
  }

  /**
   * Public leave — always dismiss via nav-stack when registered.
   */
  async function leaveMehfil() {
    if (leaving) return;
    leaving = true;
    joinGeneration += 1;
    try {
      const handle = layerHandle;
      const el = overlayEl;
      if (handle && typeof handle.close === 'function') {
        handle.close();
        return;
      }
      await teardownMehfil('leave_raw');
      if (el?.dataset?.navLayer && typeof removeNavLayer === 'function') {
        try {
          removeNavLayer(el);
        } catch (e) {}
      }
    } finally {
      if (!overlayEl) leaving = false;
    }
  }

  async function toggleMic() {
    if (!localAudio || !client) return;
    try {
      const next = !micWanted;
      await localAudio.setEnabled(next);
      micWanted = next;
      setMicUi(next);
      writePrefs({ mic: next });
      if (activeChatId) {
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser?.uid}`)?.update({ muted: !next });
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_mic_fail', 'Couldn’t toggle mic'));
    }
    pokeChrome();
  }

  async function toggleCam() {
    if (!client || !window.AgoraRTC) return;
    try {
      if (localScreen) {
        if (typeof showToast === 'function') showToast(tt('mehfil_stop_share_first', 'Stop screen share to use camera'));
        pokeChrome();
        return;
      }
      if (!localVideo) {
        camWanted = true;
        await publishCamera();
        writePrefs({ cam: true });
      } else {
        camWanted = false;
        await closeCameraTrack();
        renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
        setCamUi(false);
        writePrefs({ cam: false });
      }
      if (activeChatId) {
        rtdbRef(`mehfil/${activeChatId}/participants/${currentUser?.uid}`)?.update({ cam: !!camWanted });
      }
    } catch (e) {
      const perm =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|NotFound/i.test(String(e?.message || e));
      if (perm) {
        showStageError(tt('mehfil_cam_perm', 'Camera permission denied — check browser settings.'), {
          retry: true,
        });
      } else if (typeof showToast === 'function') {
        showToast(tt('mehfil_cam_fail', 'Camera unavailable'));
      }
    }
    pokeChrome();
  }

  async function flipCamera() {
    if (!client || !window.AgoraRTC) return;
    closeCallSheets(null);
    if (localScreen) {
      if (typeof showToast === 'function') showToast(tt('mehfil_stop_share_first', 'Stop screen share to use camera'));
      return;
    }
    if (!localVideo) {
      if (typeof showToast === 'function') showToast(tt('mehfil_cam_on_first', 'Turn camera on to flip'));
      return;
    }
    try {
      const cams = await window.AgoraRTC.getCameras();
      if (!cams || cams.length < 2) {
        if (typeof showToast === 'function') showToast(tt('mehfil_no_other_cam', 'No other camera found'));
        return;
      }
      const curId = localVideo.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
      const idx = Math.max(
        0,
        cams.findIndex((c) => c.deviceId === curId)
      );
      const next = cams[(idx + 1) % cams.length];
      await localVideo.setDevice(next.deviceId);
      if (typeof showToast === 'function') showToast(tt('mehfil_cam_flipped', 'Camera flipped'));
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_cam_flip_fail', 'Couldn’t flip camera'));
    }
    pokeChrome();
  }

  async function toggleScreenShare() {
    if (!client || !window.AgoraRTC) return;
    closeCallSheets(null);
    try {
      if (localScreen) {
        await closeScreenTrack();
        if (camWanted) await publishCamera();
        else {
          renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
          setCamUi(false);
        }
        pokeChrome();
        return;
      }
      await closeCameraTrack();
      setCamUi(false);
      const trackOrPair = await window.AgoraRTC.createScreenVideoTrack({ encoderConfig: '1080p_1' }, 'disable');
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
            renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
            setCamUi(false);
          }
        })().catch(() => {});
      });
      await client.publish([localScreen]);
      playLocalOnTile(localScreen, tt('mehfil_you_screen', 'You · screen'));
      setShareUi(true);
      if (typeof showToast === 'function') showToast(tt('mehfil_sharing', 'Sharing screen'));
    } catch (e) {
      localScreen = null;
      setShareUi(false);
      if (camWanted) {
        try {
          await publishCamera();
        } catch (err) {}
      } else {
        renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));
        setCamUi(false);
      }
      const msg =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|cancelled|canceled/i.test(String(e?.message || e))
          ? tt('mehfil_share_cancel', 'Screen share cancelled')
          : tt('mehfil_share_fail', 'Screen share unavailable on this device');
      if (typeof showToast === 'function') showToast(msg);
    }
    pokeChrome();
  }

  async function nudgeOthers() {
    if (!activeChat || !activeChatId) return;
    const name = userProfile?.name || 'Someone';
    const text = tt('mehfil_nudge_text', '{{name}} invited you to join Mehfil', { name });
    try {
      if (typeof sendRealtimeMessage === 'function') {
        await sendRealtimeMessage(activeChatId, text, activeChat.type === 'group', null, {
          type: 'mehfil_invite',
          label: tt('mehfil_join_cta', 'Join Mehfil'),
        });
      }
      if (typeof showToast === 'function') showToast(tt('mehfil_nudge_sent', 'Invite sent in chat'));
      if (!(typeof quietMode !== 'undefined' && quietMode) && typeof haptic === 'function') haptic('light');
    } catch (e) {
      if (typeof showToast === 'function') showToast(tt('mehfil_nudge_fail', 'Couldn’t send invite'));
    }
  }

  async function copyInviteLink() {
    if (!activeChatId) return;
    const url = `${location.origin}/chat/${encodeURIComponent(activeChatId)}?mehfil=1`;
    try {
      await navigator.clipboard?.writeText(url);
      if (typeof showToast === 'function') showToast(tt('mehfil_link_copied', 'Invite link copied'));
    } catch (e) {
      if (typeof showToast === 'function') showToast(url);
    }
  }

  function remoteTileLabel(user) {
    return String(user?.uid || 'Guest');
  }

  async function joinAgora(chatId, gen) {
    if (typeof apiFetch !== 'function') {
      showStageError(tt('mehfil_unavailable', 'Mehfil unavailable'), { fatal: true });
      setMehfilStatus(tt('mehfil_unavailable', 'Unavailable'), 'warn');
      return;
    }

    let tokenPayload;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'agora_token', channel: channelForChat(chatId) },
      });
      tokenPayload = envelope?.data;
    } catch (e) {
      tokenPayload = null;
    }

    if (gen !== joinGeneration) return;

    if (!tokenPayload?.configured || !tokenPayload.token) {
      showStageError(
        tt(
          'mehfil_voice_paused',
          'Voice isn’t live yet — room chat and YouTube still work. Add AGORA_APP_ID + AGORA_APP_CERTIFICATE when ready.'
        ),
        { fatal: false }
      );
      setMehfilStatus(tt('mehfil_chat_media', 'Chat + media'), 'warn');
      return;
    }

    try {
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
      const AgoraRTC = await ensureAgora();
      if (gen !== joinGeneration) return;

      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      localUid = tokenPayload.uid != null ? tokenPayload.uid : null;

      client.on('connection-state-change', (cur) => {
        if (cur === 'RECONNECTING' || cur === 'DISCONNECTING') {
          setMehfilStatus(tt('mehfil_reconnecting', 'Reconnecting…'), 'warn');
        } else if (cur === 'CONNECTED') {
          setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
        } else if (cur === 'DISCONNECTED') {
          setMehfilStatus(tt('mehfil_reconnecting', 'Reconnecting…'), 'warn');
        }
      });

      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video') {
            const stage = overlayEl?.querySelector('[data-mehfil-stage]');
            let tile = overlayEl?.querySelector(`[data-uid="${user.uid}"]`);
            if (!tile && stage) {
              tile = document.createElement('div');
              tile.className = 'mehfil-tile';
              tile.dataset.uid = user.uid;
              tile.innerHTML = `<div class="mehfil-tile-label">${esc(remoteTileLabel(user))}</div>`;
              stage.appendChild(tile);
            }
            user.videoTrack?.play(tile);
            updateWaitingState();
            setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
          }
          if (mediaType === 'audio') user.audioTrack?.play();
        } catch (e) {
          console.warn('[mehfil] subscribe', e);
        }
      });

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType !== 'video') return;
        const tile = overlayEl?.querySelector(`[data-uid="${user.uid}"]`);
        if (!tile) return;
        if (!user.hasAudio) tile.remove();
        else {
          tile.querySelector('video')?.remove();
          if (!tile.querySelector('.mehfil-tile-placeholder')) {
            const ph = document.createElement('span');
            ph.className = 'mehfil-tile-placeholder';
            ph.textContent = tt('mehfil_cam_off', 'Camera off');
            tile.prepend(ph);
          }
        }
        updateWaitingState();
      });

      client.on('user-left', (user) => {
        overlayEl?.querySelector(`[data-uid="${user.uid}"]`)?.remove();
        updateWaitingState();
      });

      client.on('volume-indicator', (volumes) => applyVolumeIndicators(volumes));

      await client.join(tokenPayload.appId, tokenPayload.channel, tokenPayload.token, tokenPayload.uid);
      if (gen !== joinGeneration) {
        try {
          await client.leave();
        } catch (e) {}
        client = null;
        return;
      }
      if (localUid == null) localUid = client.uid;
      try {
        client.enableAudioVolumeIndicator();
      } catch (e) {}

      const prefs = readPrefs();
      micWanted = prefs.mic !== false;
      camWanted = !!prefs.cam;

      localAudio = await AgoraRTC.createMicrophoneAudioTrack();
      await localAudio.setEnabled(micWanted);
      await client.publish([localAudio]);
      setMicUi(micWanted);
      setCamUi(false);
      setShareUi(false);
      renderLocalPlaceholder(tt('mehfil_cam_off', 'Camera off'));

      if (camWanted) {
        try {
          await publishCamera();
        } catch (e) {
          camWanted = false;
          writePrefs({ cam: false });
        }
      }

      setMehfilStatus(tt('mehfil_in_call', 'In the room'), 'live');
      updateWaitingState();
      await ensureMehfilParticipant(chatId);
      if (typeof showToast === 'function') {
        showToast(
          micWanted
            ? tt('mehfil_joined_mic_on', 'Joined Mehfil — mic on, camera off')
            : tt('mehfil_joined', 'Joined Mehfil')
        );
      }
    } catch (e) {
      console.warn('[mehfil] join', e);
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'mehfil_join', message: e?.message || String(e) });
      }
      const perm =
        e?.code === 'PERMISSION_DENIED' || /Permission|NotAllowed|NotFound|DEVICE/i.test(String(e?.message || e));
      showStageError(
        perm
          ? tt('mehfil_mic_perm', 'Microphone permission denied — enable it in browser settings, then retry.')
          : tt('mehfil_join_fail', 'Voice join failed — chat and YouTube still work.'),
        { retry: true }
      );
      setMehfilStatus(tt('mehfil_chat_media', 'Chat + media'), 'warn');
    }
  }

  async function openMehfil(chat) {
    if (isMehfilBlockedChat(chat)) {
      if (typeof showToast === 'function') showToast(tt('mehfil_blocked', 'Mehfil isn’t available in this chat'));
      return;
    }
    const chatId = chat.firestoreId || chat.id;
    if (!chatId) return;

    let flagAllows = true;
    try {
      if (typeof isFeatureEnabled === 'function') {
        flagAllows = await isFeatureEnabled('mehfil', { defaultValue: true });
      }
    } catch (e) {}

    // Tear down any prior room cleanly before opening
    if (overlayEl) {
      await teardownMehfil('reopen');
      if (typeof recoverNavStack === 'function') {
        /* only if desynced — skip */
      }
    }
    document.getElementById('mehfilOverlay')?.remove();

    leaving = false;
    const gen = ++joinGeneration;
    const prefs = readPrefs();
    micWanted = prefs.mic !== false;
    camWanted = false; // always start cam off visually; prefs apply after Agora join

    const el = document.createElement('div');
    el.id = 'mehfilOverlay';
    el.className = 'mehfil-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', tt('mehfil_title', 'Mehfil'));
    el.innerHTML = `
      <div class="mehfil-layout">
        <aside class="mehfil-sidebar" data-mehfil-sidebar>
          <div class="mehfil-sidebar-head">
            <div>
              <div class="mehfil-channel-label">${esc(tt('mehfil_channel', '# voice'))}</div>
              <strong>${esc(chat.name || 'Mehfil')}</strong>
            </div>
            <button type="button" class="mehfil-sidebar-toggle" data-mehfil-sidebar-hide aria-label="${esc(tt('mehfil_hide_sidebar', 'Hide sidebar'))}">‹</button>
          </div>
          <div class="mehfil-members-block">
            <div class="mehfil-members-title">${esc(tt('mehfil_in_room', 'In the room'))}</div>
            <div class="mehfil-members" data-mehfil-members></div>
          </div>
          <div class="mehfil-alone" data-mehfil-alone hidden>
            <p>${esc(tt('mehfil_alone', 'You’re the only one here — invite friends to join.'))}</p>
            <button type="button" class="mehfil-nudge-btn" data-mehfil-nudge>${esc(tt('mehfil_nudge', 'Invite to Mehfil'))}</button>
          </div>
          <div class="mehfil-sidebar-msgs" data-mehfil-chat-msgs></div>
          <form class="mehfil-sidebar-compose" data-mehfil-chat-form>
            <input type="text" maxlength="500" placeholder="${esc(tt('mehfil_msg_ph', 'Message the room…'))}" data-mehfil-chat-input enterkeyhint="send" autocomplete="off">
            <button type="submit" aria-label="${esc(tt('send', 'Send'))}">↑</button>
          </form>
        </aside>
        <div class="mehfil-main">
          <div class="mehfil-top">
            <button type="button" class="mehfil-sidebar-open" data-mehfil-sidebar-show aria-label="${esc(tt('mehfil_show_chat', 'Show chat'))}">💬</button>
            <div class="mehfil-title">${mehfilMarkHtml(20)} <span>${esc(tt('mehfil_title', 'Mehfil'))} · ${esc(chat.name || 'Chat')}</span></div>
            <div class="mehfil-status" data-mehfil-status>${esc(tt('mehfil_joining', 'Joining…'))}</div>
          </div>
          <div class="mehfil-stage" data-mehfil-stage>
            <div class="mehfil-tile mehfil-tile--self is-cam-off" data-mehfil-local-video>
              <span class="mehfil-tile-placeholder">${esc(tt('mehfil_cam_off', 'Camera off'))}</span>
              <div class="mehfil-tile-label">${esc(tt('mehfil_you_label', 'You'))}</div>
            </div>
            <div class="mehfil-waiting" data-mehfil-waiting>
              <div class="mehfil-waiting-title">${esc(tt('mehfil_waiting_title', 'Waiting for friends'))}</div>
              <div class="mehfil-waiting-msg">${esc(tt('mehfil_waiting_msg', 'Mic starts on; tap camera when you want to be seen. Share YouTube or chat in the sidebar.'))}</div>
            </div>
          </div>
          <div class="mehfil-sheet mehfil-media-sheet" data-mehfil-media>
            <div class="mehfil-now" data-mehfil-now>${esc(tt('mehfil_media_hint', 'Search a song or paste a YouTube link'))}</div>
            <div class="mehfil-yt-empty" data-mehfil-yt-empty hidden></div>
            <div id="mehfilYtHost" class="mehfil-yt" data-mehfil-yt></div>
            <div class="mehfil-media-search">
              <input type="search" placeholder="${esc(tt('mehfil_media_ph', 'Song or YouTube link…'))}" data-mehfil-q enterkeyhint="search">
              <button type="button" data-mehfil-play>${esc(tt('mehfil_play', 'Play'))}</button>
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
              ${esc(tt('mehfil_reactions', 'Reactions'))}
            </button>
            <button type="button" class="mehfil-more-item" data-mehfil-sticker-btn>
              <span class="icon" aria-hidden="true">🪷</span>
              ${esc(tt('mehfil_stickers', 'Stickers'))}
            </button>
            <button type="button" class="mehfil-more-item" data-mehfil-media-btn>
              <span class="icon" aria-hidden="true">🎵</span>
              ${esc(tt('mehfil_media', 'Music / YouTube'))}
            </button>
            <button type="button" class="mehfil-more-item" data-mehfil-nudge-more>
              <span class="icon" aria-hidden="true">🔔</span>
              ${esc(tt('mehfil_nudge', 'Invite'))}
            </button>
            <button type="button" class="mehfil-more-item" data-mehfil-copy>
              <span class="icon" aria-hidden="true">🔗</span>
              ${esc(tt('mehfil_copy_link', 'Copy link'))}
            </button>
            <button type="button" class="mehfil-more-item" data-mehfil-flip title="${esc(tt('mehfil_flip', 'Flip camera'))}">
              <span class="icon" aria-hidden="true">🔄</span>
              ${esc(tt('mehfil_flip', 'Flip'))}
            </button>
            <button type="button" class="mehfil-more-item" data-mehfil-share title="${esc(tt('mehfil_share', 'Share screen'))}">
              <span class="icon" aria-hidden="true">🖥️</span>
              <span data-mehfil-share-label>${esc(tt('mehfil_share', 'Share'))}</span>
            </button>
          </div>
          <div class="mehfil-dock">
            <div class="mehfil-dock-primary">
              <button type="button" class="mehfil-ctrl ${micWanted ? 'is-live' : 'is-muted'}" data-mehfil-mic title="${esc(tt('mehfil_mic', 'Microphone'))}" aria-label="${esc(tt('mehfil_mic', 'Toggle microphone'))}" aria-pressed="${micWanted ? 'true' : 'false'}">🎤</button>
              <button type="button" class="mehfil-ctrl is-off" data-mehfil-cam title="${esc(tt('mehfil_cam', 'Camera'))}" aria-label="${esc(tt('mehfil_cam', 'Toggle camera'))}" aria-pressed="false">📷</button>
              <button type="button" class="mehfil-ctrl" data-mehfil-more-btn title="${esc(tt('mehfil_more', 'More'))}" aria-label="${esc(tt('mehfil_more', 'More call actions'))}" aria-haspopup="true">⋯</button>
            </div>
            <button type="button" class="mehfil-leave" data-mehfil-leave title="${esc(tt('mehfil_leave', 'Leave'))}" aria-label="${esc(tt('mehfil_leave', 'Leave Mehfil'))}">${esc(tt('mehfil_leave', 'Leave'))}</button>
          </div>
        </div>
      </div>`;

    const host = shellHost();
    host.classList.add('is-mehfil-open');

    overlayEl = el;
    activeChatId = chatId;
    activeChat = chat;

    const onDismiss = () => {
      // Called from nav-stack popstate / openLayer.close
      joinGeneration += 1;
      teardownMehfil('nav_dismiss');
      leaving = false;
    };

    if (typeof openLayer === 'function') {
      layerHandle = openLayer(el, onDismiss, {
        host,
        remove: false,
        role: 'dialog',
        label: tt('mehfil_title', 'Mehfil'),
      });
    } else {
      host.appendChild(el);
      el.dataset.navManaged = '1';
      if (typeof pushNavLayer === 'function') pushNavLayer(el, onDismiss);
    }

    if (typeof enableSwipeBack === 'function') {
      enableSwipeBack(el, () => {
        if (typeof hasNavLayers === 'function' && hasNavLayers()) {
          try {
            history.back();
          } catch (e) {
            leaveMehfil();
          }
        } else leaveMehfil();
      });
    }

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mehfil-dock, .mehfil-sheet, .mehfil-more-menu, .mehfil-top, .mehfil-sidebar')) {
        pokeChrome();
        return;
      }
      pokeChrome();
    });
    pokeChrome();

    el.querySelector('[data-mehfil-sidebar-hide]')?.addEventListener('click', () => {
      el.classList.add('mehfil-sidebar-collapsed');
    });
    el.querySelector('[data-mehfil-sidebar-show]')?.addEventListener('click', () => {
      el.classList.remove('mehfil-sidebar-collapsed');
    });
    el.querySelector('[data-mehfil-chat-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = el.querySelector('[data-mehfil-chat-input]');
      const text = String(input?.value || '').trim();
      if (!text || !activeChatId) return;
      input.value = '';
      try {
        await ensureMehfilParticipant(activeChatId);
        await rtdbRef(`mehfil/${activeChatId}/chat`)?.push({
          text: text.slice(0, 500),
          by: currentUser?.uid || null,
          name: userProfile?.name || userProfile?.username || 'You',
          at: Date.now(),
        });
      } catch (err) {
        if (typeof showToast === 'function') showToast(tt('mehfil_send_fail', 'Could not send'));
      }
    });

    el.querySelector('[data-mehfil-leave]')?.addEventListener('click', () => {
      if (layerHandle) layerHandle.close();
      else leaveMehfil();
    });
    el.querySelector('[data-mehfil-mic]')?.addEventListener('click', toggleMic);
    el.querySelector('[data-mehfil-cam]')?.addEventListener('click', toggleCam);
    el.querySelector('[data-mehfil-more-btn]')?.addEventListener('click', () => toggleCallSheet('more'));
    el.querySelector('[data-mehfil-react-btn]')?.addEventListener('click', () => toggleCallSheet('reacts'));
    el.querySelector('[data-mehfil-sticker-btn]')?.addEventListener('click', () => toggleCallSheet('stickers'));
    el.querySelector('[data-mehfil-media-btn]')?.addEventListener('click', () => toggleCallSheet('media'));
    el.querySelector('[data-mehfil-flip]')?.addEventListener('click', flipCamera);
    el.querySelector('[data-mehfil-share]')?.addEventListener('click', toggleScreenShare);
    el.querySelector('[data-mehfil-nudge]')?.addEventListener('click', nudgeOthers);
    el.querySelector('[data-mehfil-nudge-more]')?.addEventListener('click', () => {
      closeCallSheets(null);
      nudgeOthers();
    });
    el.querySelector('[data-mehfil-copy]')?.addEventListener('click', () => {
      closeCallSheets(null);
      copyInviteLink();
    });
    el.querySelectorAll('[data-mehfil-reacts] button, [data-mehfil-stickers] button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const emoji = btn.dataset.emoji;
        showReactionBurst(emoji);
        if (activeChatId) {
          try {
            await ensureMehfilParticipant(activeChatId);
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

    await ensureMehfilParticipant(chatId);
    bindMembersList(chatId);
    bindMediaSync();

    if (!flagAllows) {
      showStageError(
        tt('mehfil_flag_off', 'Mehfil voice is paused right now. Room chat and YouTube sync still work.'),
        { fatal: false }
      );
      setMehfilStatus(tt('mehfil_chat_only', 'Chat only'), 'warn');
      return;
    }

    await joinAgora(chatId, gen);
  }

  /** Live presence for chat list / header badges */
  function watchMehfilPresence(chatId, cb) {
    if (!chatId || typeof cb !== 'function') return () => {};
    if (!presenceWatchers.has(chatId)) presenceWatchers.set(chatId, new Set());
    presenceWatchers.get(chatId).add(cb);

    if (!presenceUnsubs.has(chatId)) {
      const ref = rtdbRef(`mehfil/${chatId}/participants`);
      if (ref) {
        const handler = (snap) => {
          const val = snap.val() || {};
          const uids = Object.keys(val);
          const set = presenceWatchers.get(chatId);
          set?.forEach((fn) => {
            try {
              fn({ count: uids.length, uids, participants: val });
            } catch (e) {}
          });
        };
        ref.on('value', handler);
        presenceUnsubs.set(chatId, () => ref.off('value', handler));
      }
    }

    return () => {
      const set = presenceWatchers.get(chatId);
      set?.delete(cb);
      if (set && set.size === 0) {
        presenceWatchers.delete(chatId);
        const unsub = presenceUnsubs.get(chatId);
        try {
          unsub?.();
        } catch (e) {}
        presenceUnsubs.delete(chatId);
      }
    };
  }

  function mehfilEligible(chat) {
    return !isMehfilBlockedChat(chat);
  }

  function renderMehfilMark(size) {
    return mehfilMarkHtml(size);
  }

  const guardMehfil = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openMehfil = guardMehfil('mehfil_open', openMehfil);
  window.leaveMehfil = guardMehfil('mehfil_leave', leaveMehfil);
  window.watchMehfilPresence = watchMehfilPresence;
  window.mehfilEligible = mehfilEligible;
  window.mehfilMarkHtml = renderMehfilMark;
  window.isMehfilOpen = () => !!overlayEl;
})();
