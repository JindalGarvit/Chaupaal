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
  let activeChatId = null;
  let rtdbUnsubs = [];
  let ytPlayer = null;
  let mediaHost = false;
  let overlayEl = null;

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

  function ensureStyles() {
    if (document.getElementById('mehfilStyles')) return;
    const s = document.createElement('style');
    s.id = 'mehfilStyles';
    s.textContent = `
      .mehfil-overlay{position:absolute;inset:0;z-index:130;background:#0F1117;color:#fff;display:flex;flex-direction:column;font-family:Inter,sans-serif;}
      .mehfil-top{display:flex;align-items:center;gap:10px;padding:12px 14px;padding-top:calc(12px + env(safe-area-inset-top,0px));border-bottom:1px solid rgba(255,255,255,.08);}
      .mehfil-title{flex:1;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;}
      .mehfil-leave{border:none;background:rgba(230,57,70,.9);color:#fff;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;}
      .mehfil-stage{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:10px;overflow:auto;}
      .mehfil-tile{position:relative;background:#1B1F3B;border-radius:14px;overflow:hidden;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;}
      .mehfil-tile video{width:100%;height:100%;object-fit:cover;}
      .mehfil-tile-label{position:absolute;left:8px;bottom:8px;font-size:11px;background:rgba(0,0,0,.5);padding:3px 8px;border-radius:8px;}
      .mehfil-media{padding:8px 12px;border-top:1px solid rgba(255,255,255,.08);background:#12141c;}
      .mehfil-media-search{display:flex;gap:8px;margin-bottom:8px;}
      .mehfil-media-search input{flex:1;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#1B1F3B;color:#fff;padding:10px 12px;font-size:14px;}
      .mehfil-media-search button{border:none;border-radius:10px;background:var(--red,#E63946);color:#fff;font-weight:700;padding:0 12px;cursor:pointer;}
      .mehfil-yt{width:100%;aspect-ratio:16/9;border:0;border-radius:12px;background:#000;margin-bottom:8px;}
      .mehfil-now{font-size:12px;opacity:.85;margin-bottom:6px;}
      .mehfil-dock{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.08);}
      .mehfil-dock button{width:48px;height:48px;border-radius:50%;border:none;background:#1B1F3B;color:#fff;font-size:18px;cursor:pointer;}
      .mehfil-dock button.is-on{background:var(--red,#E63946);}
      .mehfil-ask{background:linear-gradient(135deg,#E63946,#F4A261)!important;}
      .mehfil-react-tray,.mehfil-sticker-tray{display:none;flex-wrap:wrap;gap:6px;justify-content:center;padding:8px 12px;background:#12141c;}
      .mehfil-react-tray.is-open,.mehfil-sticker-tray.is-open{display:flex;}
      .mehfil-react-tray button,.mehfil-sticker-tray button{font-size:22px;border:none;background:transparent;cursor:pointer;padding:4px;}
      .mehfil-float-react{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);font-size:36px;animation:mehfilPop .9s ease forwards;pointer-events:none;z-index:5;}
      @keyframes mehfilPop{0%{opacity:0;transform:translate(-50%,10px) scale(.6)}30%{opacity:1}100%{opacity:0;transform:translate(-50%,-40px) scale(1.2)}}
      .mehfil-ai-mark{width:22px;height:22px;border-radius:6px;background:#E63946;display:inline-flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 0 2px rgba(255,255,255,.15);}
      .mehfil-disabled{padding:24px;text-align:center;line-height:1.5;}
    `;
    document.head.appendChild(s);
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
    try {
      if (localAudio) {
        localAudio.close();
        localAudio = null;
      }
      if (localVideo) {
        localVideo.close();
        localVideo = null;
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
    if (overlayEl) {
      if (typeof removeNavLayer === 'function') removeNavLayer(overlayEl);
      overlayEl.remove();
      overlayEl = null;
    }
  }

  async function toggleMic() {
    if (!localAudio || !client) return;
    const track = localAudio;
    const enabled = track.enabled !== false ? track.enabled !== false : true;
    // Agora local track: setEnabled
    const next = !(track.isPlaying || track.enabled !== false);
    try {
      await track.setEnabled(next);
      overlayEl?.querySelector('[data-mehfil-mic]')?.classList.toggle('is-on', next);
    } catch (e) {
      try {
        if (next) await client.publish([track]);
        else await client.unpublish([track]);
        overlayEl?.querySelector('[data-mehfil-mic]')?.classList.toggle('is-on', next);
      } catch (err) {}
    }
  }

  async function toggleCam() {
    if (!client || !window.AgoraRTC) return;
    const btn = overlayEl?.querySelector('[data-mehfil-cam]');
    try {
      if (!localVideo) {
        localVideo = await window.AgoraRTC.createCameraVideoTrack();
        await client.publish([localVideo]);
        const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
        if (tile) {
          tile.innerHTML = '';
          localVideo.play(tile);
        }
        btn?.classList.add('is-on');
      } else {
        await client.unpublish([localVideo]);
        localVideo.close();
        localVideo = null;
        const tile = overlayEl?.querySelector('[data-mehfil-local-video]');
        if (tile) tile.innerHTML = '<span style="opacity:.5">Camera off</span>';
        btn?.classList.remove('is-on');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Camera unavailable');
    }
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
        <button type="button" class="mehfil-leave" data-mehfil-leave>Leave</button>
      </div>
      <div class="mehfil-stage" data-mehfil-stage>
        <div class="mehfil-tile" data-mehfil-local-video><span style="opacity:.5">Camera off</span><div class="mehfil-tile-label">You</div></div>
      </div>
      <div class="mehfil-media">
        <div class="mehfil-now" data-mehfil-now>Search a song or paste a YouTube link</div>
        <div id="mehfilYtHost" class="mehfil-yt" data-mehfil-yt></div>
        <div class="mehfil-media-search">
          <input type="search" placeholder="Song or YouTube link…" data-mehfil-q enterkeyhint="search">
          <button type="button" data-mehfil-play>Play</button>
        </div>
      </div>
      <div class="mehfil-react-tray" data-mehfil-reacts>
        ${REACTIONS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <div class="mehfil-sticker-tray" data-mehfil-stickers>
        ${STICKERS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <div class="mehfil-dock">
        <button type="button" data-mehfil-mic title="Mic (off by default)">🎤</button>
        <button type="button" data-mehfil-cam title="Camera (off by default)">📷</button>
        <button type="button" data-mehfil-react-btn title="Reactions">😀</button>
        <button type="button" data-mehfil-sticker-btn title="Stickers">🪷</button>
        <button type="button" class="mehfil-ask" data-mehfil-ask title="Ask Chaupaal"><span class="mehfil-ai-mark" aria-hidden="true">🏠</span></button>
      </div>`;
    device.appendChild(el);
    overlayEl = el;
    if (typeof pushNavLayer === 'function') pushNavLayer(el, () => leaveMehfil());

    el.querySelector('[data-mehfil-leave]')?.addEventListener('click', leaveMehfil);
    el.querySelector('[data-mehfil-mic]')?.addEventListener('click', toggleMic);
    el.querySelector('[data-mehfil-cam]')?.addEventListener('click', toggleCam);
    el.querySelector('[data-mehfil-react-btn]')?.addEventListener('click', () => {
      el.querySelector('[data-mehfil-reacts]')?.classList.toggle('is-open');
      el.querySelector('[data-mehfil-stickers]')?.classList.remove('is-open');
    });
    el.querySelector('[data-mehfil-sticker-btn]')?.addEventListener('click', () => {
      el.querySelector('[data-mehfil-stickers]')?.classList.toggle('is-open');
      el.querySelector('[data-mehfil-reacts]')?.classList.remove('is-open');
    });
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
      activeChatId = chatId;
      bindMediaSync();
      return;
    }

    try {
      if (typeof pauseAllMusic === 'function') pauseAllMusic();
      const AgoraRTC = await ensureAgora();
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
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
        }
        if (mediaType === 'audio') user.audioTrack?.play();
      });
      await client.join(tokenPayload.appId, tokenPayload.channel, tokenPayload.token, tokenPayload.uid);
      // Mic/cam OFF by default — create mic track muted
      localAudio = await AgoraRTC.createMicrophoneAudioTrack();
      await localAudio.setEnabled(false);
      await client.publish([localAudio]);
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
      activeChatId = chatId;
      bindMediaSync();
    }
  }

  // Agora integration boundary — failures report + recover shell (CONVENTIONS 4c)
  const guardMehfil = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openMehfil = guardMehfil('mehfil_open', openMehfil);
  window.leaveMehfil = guardMehfil('mehfil_leave', leaveMehfil);
})();
