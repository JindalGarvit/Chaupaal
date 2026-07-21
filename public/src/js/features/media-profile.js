// ===================== RICH MEDIA PROFILE (2A) =====================
// Photos, short videos, voice notes — Cloudinary when available; caps enforced.
// Matching embeddings ignore media (3A); mediaCaptions reserved for future 3C.

(function () {
  'use strict';

  const CAPS = { photo: 6, video: 2, voice: 3 };
  const VIDEO_MAX_MS = 30000;
  const VOICE_MAX_S = 60;
  const STORAGE_KEY = 'chaupaal_profile_media';

  function loadMedia() {
    try {
      const fromDp =
        typeof digitalProfile !== 'undefined' && Array.isArray(digitalProfile.profileMedia)
          ? digitalProfile.profileMedia
          : null;
      if (fromDp && fromDp.length) return fromDp.slice();
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function countByType(items, type) {
    return items.filter((i) => i.type === type).length;
  }

  function persistMedia(items) {
    const clean = (items || []).slice(0, CAPS.photo + CAPS.video + CAPS.voice);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (e) {}
    if (typeof digitalProfile !== 'undefined') {
      digitalProfile.profileMedia = clean;
      // Hook for future transcription (3C) — captions optional, not used in embeddings yet
      digitalProfile.mediaCaptions = clean
        .filter((i) => i.caption)
        .map((i) => ({ id: i.id || i.ts, type: i.type, caption: i.caption }));
      try {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      } catch (e) {}
    }
    if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
      // Store URL metadata only (not huge base64) when items have remote urls
      const remote = clean
        .filter((i) => i.url || (i.src && !String(i.src).startsWith('data:')))
        .map((i) => ({
          id: i.id || String(i.ts),
          type: i.type,
          url: i.url || i.src,
          thumb: i.thumb || null,
          duration: i.duration || null,
          caption: i.caption || '',
          ts: i.ts || Date.now(),
        }));
      db.collection('users')
        .doc(currentUser.uid)
        .update({ 'profile.profileMedia': remote, profileMedia: remote })
        .catch(() => {});
    }
    if (typeof refreshProfileCompletionUI === 'function') refreshProfileCompletionUI();
    if (typeof onProfileFieldSaved === 'function' && clean.length) {
      onProfileFieldSaved('profileMedia', '', String(clean.length));
    }
    return clean;
  }

  async function uploadMediaFile(file, kind) {
    if (typeof isMediaUploadReady === 'function') {
      const ready = await isMediaUploadReady();
      if (!ready) return null;
    }
    if (kind === 'photo' && typeof uploadOptimizedImage === 'function') {
      const up = await uploadOptimizedImage(file, { folder: 'profile-media' });
      return { url: up.media, thumb: up.thumb || up.media, src: up.media };
    }
    if (kind === 'video' && typeof uploadVideoFile === 'function') {
      const up = await uploadVideoFile(file, { folder: 'profile-media' });
      return { url: up.media || up.url, thumb: up.thumb || null, src: up.media || up.url };
    }
    if (kind === 'voice' && typeof uploadToCloudinary === 'function') {
      try {
        const up = await uploadToCloudinary(file, { resourceType: 'video', folder: 'profile-voice' });
        return { url: up.secure_url || up.url, src: up.secure_url || up.url };
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addPhotoFiles(files) {
    let items = loadMedia();
    const room = CAPS.photo - countByType(items, 'photo');
    if (room <= 0) {
      if (typeof showToast === 'function') showToast(`Max ${CAPS.photo} photos`);
      return items;
    }
    for (const file of [...files].slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      let remote = null;
      try {
        remote = await uploadMediaFile(file, 'photo');
      } catch (e) {}
      const src = remote?.src || (await fileToDataUrl(file));
      items.push({
        id: 'pm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'photo',
        src,
        url: remote?.url || null,
        thumb: remote?.thumb || null,
        caption: '',
        ts: Date.now(),
      });
    }
    return persistMedia(items);
  }

  async function addVideoFile(file) {
    let items = loadMedia();
    if (countByType(items, 'video') >= CAPS.video) {
      if (typeof showToast === 'function') showToast(`Max ${CAPS.video} short videos`);
      return items;
    }
    if (file.size > 50 * 1024 * 1024) {
      if (typeof showToast === 'function') showToast('Video must be under 50MB');
      return items;
    }
    // Duration check when possible
    try {
      const url = URL.createObjectURL(file);
      const dur = await new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          resolve(v.duration * 1000);
          URL.revokeObjectURL(url);
        };
        v.onerror = () => {
          resolve(0);
          URL.revokeObjectURL(url);
        };
        v.src = url;
      });
      if (dur > VIDEO_MAX_MS + 500) {
        if (typeof showToast === 'function') showToast('Keep videos to ~30 seconds');
        return items;
      }
    } catch (e) {}

    if (typeof showToast === 'function') showToast('Uploading video…');
    let remote = null;
    try {
      remote = await uploadMediaFile(file, 'video');
    } catch (e) {}
    const src = remote?.src || (await fileToDataUrl(file));
    items.push({
      id: 'pm_' + Date.now(),
      type: 'video',
      src,
      url: remote?.url || null,
      thumb: remote?.thumb || null,
      caption: '',
      ts: Date.now(),
    });
    return persistMedia(items);
  }

  async function addVoiceBlob(blob, durationSec) {
    let items = loadMedia();
    if (countByType(items, 'voice') >= CAPS.voice) {
      if (typeof showToast === 'function') showToast(`Max ${CAPS.voice} voice notes`);
      return items;
    }
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
    let remote = null;
    try {
      remote = await uploadMediaFile(file, 'voice');
    } catch (e) {}
    const src = remote?.src || (await fileToDataUrl(file));
    items.push({
      id: 'pm_' + Date.now(),
      type: 'voice',
      src,
      url: remote?.url || null,
      duration: durationSec || 0,
      caption: '',
      ts: Date.now(),
    });
    return persistMedia(items);
  }

  function renderMediaGrid(items, gridEl) {
    if (!gridEl) return;
    gridEl.innerHTML = items
      .map((item, i) => {
        const src = item.url || item.src;
        if (item.type === 'photo')
          return `<div class="profile-media-cell" data-i="${i}">
        <img src="${src}" alt="">
        <button type="button" data-remove-media="${i}" aria-label="Remove">✕</button>
      </div>`;
        if (item.type === 'video')
          return `<div class="profile-media-cell profile-media-cell--video" data-i="${i}" data-play-video="${src}">
        <video src="${src}" muted playsinline preload="metadata"></video>
        <span class="profile-media-badge">▶</span>
        <span class="profile-media-scrub" aria-hidden="true"><i></i></span>
        <button type="button" data-remove-media="${i}" aria-label="Remove">✕</button>
      </div>`;
        if (item.type === 'voice') {
          const d = item.duration || 0;
          const label = d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` : 'Voice';
          return `<div class="profile-media-cell profile-media-cell--voice" data-i="${i}" data-play-voice="${src}">
        <span class="profile-media-voice-icon">🎙️</span>
        <span class="profile-media-voice-label">${label}</span>
        <span class="profile-media-badge profile-media-play">▶</span>
        <button type="button" data-remove-media="${i}" aria-label="Remove">✕</button>
      </div>`;
        }
        return '';
      })
      .join('');
  }

  function renderProfileMediaSection(el) {
    if (!el || el.querySelector('#profileMediaGrid')) return;
    const mediaItems = loadMedia();
    const section = document.createElement('div');
    section.className = 'profile-media-section';
    section.innerHTML = `
    <div class="profile-media-title">Photos, video & voice</div>
    <div class="profile-media-hint">
      Up to ${CAPS.photo} photos, ${CAPS.video} short videos (≤30s), and ${CAPS.voice} voice notes.
      Shown on your profile · not used for matching text yet.
    </div>
    <div class="profile-media-actions">
      <label class="profile-media-action">📷 Photo<input type="file" accept="image/*" id="profileMediaPhoto" hidden multiple></label>
      <label class="profile-media-action">🎬 Video<input type="file" accept="video/*" id="profileMediaVideo" hidden></label>
      <button type="button" class="profile-media-action" id="profileVoiceBtn">🎙️ Voice</button>
    </div>
    <div id="profileMediaGrid" class="profile-media-grid"></div>
    <div id="voiceRecorder" class="profile-voice-recorder" hidden>
      <div class="profile-media-title" style="font-size:13px;margin-bottom:6px;">Record a voice note</div>
      <div class="profile-media-hint" style="margin-bottom:10px;">Max ${VOICE_MAX_S}s. Speak naturally — this stays on your profile strip.</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button type="button" id="voiceRecordStart" class="btn btn--primary">Record</button>
        <button type="button" id="voiceRecordStop" class="btn" hidden>Stop</button>
        <div id="voiceTimer" class="profile-voice-timer" hidden>0:00</div>
      </div>
      <audio id="voicePreview" controls hidden style="width:100%;margin-top:10px;"></audio>
      <button type="button" id="voiceSave" class="btn btn--primary btn--block" hidden style="margin-top:8px;">Save voice note</button>
    </div>`;
    el.appendChild(section);

    const grid = section.querySelector('#profileMediaGrid');
    const refresh = (items) => {
      renderMediaGrid(items, grid);
      grid.querySelectorAll('[data-remove-media]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = loadMedia();
          next.splice(Number(btn.dataset.removeMedia), 1);
          persistMedia(next);
          refresh(next);
        });
      });
      grid.querySelectorAll('[data-play-voice]').forEach((cell) => {
        cell.addEventListener('click', (e) => {
          if (e.target.closest('[data-remove-media]')) return;
          playVoiceNote(cell.dataset.playVoice);
        });
      });
      grid.querySelectorAll('[data-play-video]').forEach((cell) => {
        cell.addEventListener('click', (e) => {
          if (e.target.closest('[data-remove-media]')) return;
          const v = cell.querySelector('video');
          const scrub = cell.querySelector('.profile-media-scrub > i');
          if (!v) return;
          if (v.paused) {
            grid.querySelectorAll('[data-play-video] video').forEach((other) => {
              if (other !== v) {
                other.pause();
                other.closest('.profile-media-cell')?.classList.remove('is-playing');
              }
            });
            v.muted = false;
            v.play().catch(() => {});
            cell.classList.add('is-playing');
            const tick = () => {
              if (scrub && v.duration) scrub.style.width = `${(v.currentTime / v.duration) * 100}%`;
              if (!v.paused) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            v.onended = () => {
              cell.classList.remove('is-playing');
              if (scrub) scrub.style.width = '0%';
            };
          } else {
            v.pause();
            cell.classList.remove('is-playing');
          }
        });
      });
    };
    refresh(mediaItems);

    section.querySelector('#profileMediaPhoto').addEventListener('change', async (e) => {
      if (typeof showToast === 'function') showToast('Adding photos…');
      const next = await addPhotoFiles(e.target.files);
      refresh(next);
      e.target.value = '';
    });

    section.querySelector('#profileMediaVideo').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const next = await addVideoFile(file);
      refresh(next);
      e.target.value = '';
    });

    section.querySelector('#profileVoiceBtn').addEventListener('click', () => {
      const vr = section.querySelector('#voiceRecorder');
      vr.hidden = !vr.hidden;
    });

    let mediaRecorder = null;
    let audioChunks = [];
    let voiceTimerInterval = null;
    let voiceSecs = 0;
    let pendingBlob = null;

    section.querySelector('#voiceRecordStart').addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (ev) => audioChunks.push(ev.data);
        mediaRecorder.onstop = () => {
          pendingBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(pendingBlob);
          const preview = section.querySelector('#voicePreview');
          preview.src = url;
          preview.hidden = false;
          section.querySelector('#voiceSave').hidden = false;
          stream.getTracks().forEach((t) => t.stop());
        };
        mediaRecorder.start();
        section.querySelector('#voiceRecordStart').hidden = true;
        section.querySelector('#voiceRecordStop').hidden = false;
        section.querySelector('#voiceTimer').hidden = false;
        voiceSecs = 0;
        voiceTimerInterval = setInterval(() => {
          voiceSecs++;
          const m = Math.floor(voiceSecs / 60);
          const s = voiceSecs % 60;
          section.querySelector('#voiceTimer').textContent = `${m}:${String(s).padStart(2, '0')}`;
          if (voiceSecs >= VOICE_MAX_S) {
            clearInterval(voiceTimerInterval);
            mediaRecorder?.stop();
            section.querySelector('#voiceRecordStop').click();
          }
        }, 1000);
      } catch (err) {
        if (typeof showToast === 'function') showToast('Microphone access needed for voice notes');
      }
    });

    section.querySelector('#voiceRecordStop').addEventListener('click', () => {
      clearInterval(voiceTimerInterval);
      mediaRecorder?.stop();
      section.querySelector('#voiceRecordStart').hidden = false;
      section.querySelector('#voiceRecordStop').hidden = true;
      section.querySelector('#voiceTimer').hidden = true;
    });

    section.querySelector('#voiceSave').addEventListener('click', async () => {
      if (!pendingBlob) return;
      if (typeof showToast === 'function') showToast('Saving voice note…');
      const next = await addVoiceBlob(pendingBlob, voiceSecs);
      refresh(next);
      section.querySelector('#voiceRecorder').hidden = true;
      section.querySelector('#voicePreview').hidden = true;
      section.querySelector('#voiceSave').hidden = true;
      pendingBlob = null;
      if (typeof showToast === 'function') showToast('Voice note saved');
    });
  }

  function playVoiceNote(src) {
    document.getElementById('globalVoicePlayer')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'globalVoicePlayer';
    wrap.className = 'profile-voice-player-wrap';
    wrap.style.cssText = 'position:absolute;left:12px;right:12px;bottom:80px;z-index:130;background:var(--white);border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);';
    const audio = document.createElement('audio');
    audio.src = src;
    audio.autoplay = true;
    audio.className = 'profile-voice-player';
    wrap.appendChild(audio);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'margin-top:8px;width:100%;padding:10px;border:none;background:var(--cream);border-radius:10px;font-weight:700;cursor:pointer;';
    close.addEventListener('click', () => wrap.remove());
    wrap.appendChild(close);
    document.querySelector('.device')?.appendChild(wrap);
    if (typeof bindMediaControls === 'function') bindMediaControls(audio, wrap);
    if (typeof pushNavLayer === 'function') pushNavLayer(wrap, () => wrap.remove());
    audio.onended = () => {};
  }

  window.renderProfileMediaSection = renderProfileMediaSection;
  window.loadProfileMedia = loadMedia;
  window.persistProfileMedia = persistMedia;
  window.playVoiceNote = playVoiceNote;
  window.removeProfileMedia = function (idx) {
    const items = loadMedia();
    items.splice(idx, 1);
    persistMedia(items);
    if (typeof renderProfileModal === 'function') renderProfileModal();
  };

  const _profileMediaObserver = new MutationObserver(() => {
    const personalTab = document.querySelector('.profile-section-tab[data-sec="Personal"].active');
    const content = document.getElementById('profileSectionContent');
    if (personalTab && content && !content.querySelector('#profileMediaGrid')) {
      renderProfileMediaSection(content);
    }
  });
  const _profileContent = document.getElementById('profileContent');
  if (_profileContent) _profileMediaObserver.observe(_profileContent, { childList: true, subtree: true });
})();
