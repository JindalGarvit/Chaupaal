/**
 * Duniya feed post composer — media-first picker, per-slide crop, caption extras.
 * Stories stay on DuniyaStory. This module never opens the story editor except
 * as an after-share seed.
 */
(function () {
  'use strict';

  const MAX_SLIDES = 10;
  const MAX_CAPTION = 4000;
  const MAX_VIDEO_MS = 10 * 60 * 1000;
  const MAX_TAGS = 20;
  const MAX_COLLAB = 3;
  const FILTERS = [
    { id: 'normal', label: 'Normal', css: 'none' },
    { id: 'bright', label: 'Bright', css: 'brightness(1.18)' },
    { id: 'warm', label: 'Warm', css: 'sepia(0.25) saturate(1.15)' },
    { id: 'cool', label: 'Cool', css: 'hue-rotate(12deg) saturate(0.9)' },
    { id: 'contrast', label: 'Contrast', css: 'contrast(1.2)' },
    { id: 'mono', label: 'Mono', css: 'grayscale(1)' },
    { id: 'fade', label: 'Fade', css: 'contrast(0.85) brightness(1.08)' },
  ];

  const NS = (window.DuniyaCompose = window.DuniyaCompose || {});
  let state = null;
  let host = null;
  let layerHandle = null;
  let draftCtl = null;
  let cropPointers = new Map();

  function tt(key, fallback) {
    try {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  }

  function report(err) {
    if (typeof reportClientError === 'function') {
      reportClientError({
        feature: 'duniya_compose',
        message: err?.message || String(err),
        stack: err?.stack || '',
        fatal: false,
      });
    }
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function uid() {
    return 's_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function clientId() {
    const raw = (crypto.randomUUID && crypto.randomUUID()) || uid() + uid();
    return String(raw).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36) || uid();
  }

  function device() {
    return document.getElementById('device') || document.querySelector('.device') || document.body;
  }

  function meUser() {
    const u = typeof userProfile !== 'undefined' ? userProfile : {};
    const cu = typeof currentUser !== 'undefined' ? currentUser : null;
    return {
      uid: cu?.uid || 'me',
      name: u.name || cu?.displayName || 'You',
      avatar: u.avatar || '🪑',
      photoURL: u.photoURL || cu?.photoURL || null,
      username: u.username || '',
      profileType:
        typeof ownProfileType === 'function'
          ? ownProfileType()
          : typeof getProfileType === 'function'
            ? getProfileType()
            : 'personal',
    };
  }

  function blankState(mode) {
    return {
      mode: mode === 'text' ? 'text' : mode === 'edit' ? 'edit' : 'media',
      editPost: null,
      slides: [],
      index: 0,
      caption: '',
      mentioned: [],
      location: null,
      music: null,
      taggedPeople: [],
      hideLikeCount: false,
      commentsOff: false,
      saveOnly: false,
      collabInvites: [],
      firstComment: '',
      coverIndex: 0,
      screen: 'picker',
      uploadPct: 0,
      uploadMsg: '',
      tagMode: false,
      retrySlides: [],
    };
  }

  function activeSlide() {
    return state?.slides[state.index] || null;
  }

  function persistDraft() {
    if (!draftCtl || !state || state.mode === 'edit') return;
    try {
      draftCtl.flush?.();
    } catch (e) {}
  }

  function draftPayload() {
    if (!state) return {};
    return {
      caption: state.caption || '',
      saveOnly: !!state.saveOnly,
      hideLikeCount: !!state.hideLikeCount,
      commentsOff: !!state.commentsOff,
      firstComment: state.firstComment || '',
      location: state.location,
      music: state.music,
      taggedPeople: state.taggedPeople,
      collabInvites: state.collabInvites.map((u) => ({ uid: u.uid, name: u.name, username: u.username })),
      mentioned: state.mentioned,
      coverIndex: state.coverIndex,
      slides: state.slides.map((s) => ({
        id: s.id,
        type: s.type,
        crop: s.crop,
        filter: s.filter,
        alt: s.alt,
        muted: s.muted,
        trimStart: s.trimStart,
        trimEnd: s.trimEnd,
        durationMs: s.durationMs,
        width: s.width,
        height: s.height,
        remote: s.remote || null,
        gifUrl: s.gifUrl || null,
        needsReattach: !s.file && !s.remote && !s.gifUrl,
      })),
    };
  }

  function applyDraft(saved) {
    if (!saved || !state) return;
    state.caption = saved.caption || '';
    state.saveOnly = !!saved.saveOnly;
    state.hideLikeCount = !!saved.hideLikeCount;
    state.commentsOff = !!saved.commentsOff;
    state.firstComment = saved.firstComment || '';
    state.location = saved.location || null;
    state.music = saved.music || null;
    state.taggedPeople = Array.isArray(saved.taggedPeople) ? saved.taggedPeople : [];
    state.collabInvites = Array.isArray(saved.collabInvites) ? saved.collabInvites : [];
    state.mentioned = Array.isArray(saved.mentioned) ? saved.mentioned : [];
    state.coverIndex = Number(saved.coverIndex) || 0;
    if (Array.isArray(saved.slides) && saved.slides.length && !state.slides.length) {
      state.slides = saved.slides.map((s) => ({
        id: s.id || uid(),
        type: s.type || 'image',
        file: null,
        localUrl: '',
        remote: s.remote || null,
        gifUrl: s.gifUrl || null,
        crop: s.crop || { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
        filter: s.filter || 'normal',
        alt: s.alt || '',
        muted: !!s.muted,
        trimStart: s.trimStart || 0,
        trimEnd: s.trimEnd || 0,
        durationMs: s.durationMs || 0,
        width: s.width || 0,
        height: s.height || 0,
        posterUrl: '',
        posterTime: 0,
        needsReattach: !s.remote && !s.gifUrl,
      }));
    }
  }

  function closeComposer() {
    persistDraft();
    if (state?.slides) {
      state.slides.forEach((s) => {
        if (s.localUrl && s.localUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(s.localUrl);
          } catch (e) {}
        }
      });
    }
    draftCtl = null;
    state = null;
    if (layerHandle?.close) layerHandle.close();
    else if (host) {
      host.remove();
      if (typeof restoreAppShell === 'function') restoreAppShell('duniya_compose');
    }
    host = null;
    layerHandle = null;
  }

  function mountHost(title) {
    if (host) host.remove();
    host = document.createElement('div');
    host.className = 'duniya-compose';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', title || 'New post');
    host.innerHTML = `<div class="duniya-compose-bar">
      <button type="button" data-dc-close aria-label="Close">✕</button>
      <h2 data-dc-title>${esc(title || 'New post')}</h2>
      <button type="button" class="dc-share" data-dc-next>Next</button>
    </div>
    <div class="duniya-compose-body" data-dc-body></div>`;
    device().appendChild(host);
    host.querySelector('[data-dc-close]').addEventListener('click', () => {
      if (state?.screen === 'extras' && state.mode !== 'edit' && state.slides.length) {
        showCrop();
        return;
      }
      if (state?.screen === 'crop') {
        showPicker();
        return;
      }
      closeComposer();
    });
    host.querySelector('[data-dc-next]').addEventListener('click', onPrimary);
    if (typeof openLayer === 'function') {
      layerHandle = openLayer(host, () => {
        persistDraft();
        host = null;
        layerHandle = null;
        state = null;
      }, { role: 'dialog', label: title || 'New post' });
    } else if (typeof pushNavLayer === 'function') {
      host.dataset.navManaged = '1';
      pushNavLayer(host, closeComposer);
    }
    if (typeof bindDraftAutosave === 'function' && state?.mode !== 'edit') {
      draftCtl = bindDraftAutosave({
        name: 'duniya',
        getState: draftPayload,
        applyState: applyDraft,
      });
    }
  }

  function setTitle(title, nextLabel) {
    const tEl = host?.querySelector('[data-dc-title]');
    const nEl = host?.querySelector('[data-dc-next]');
    if (tEl) tEl.textContent = title;
    if (nEl) {
      nEl.textContent = nextLabel;
      nEl.disabled = false;
    }
  }

  function body() {
    return host?.querySelector('[data-dc-body]');
  }

  function probeMedia(slide) {
    return new Promise((resolve) => {
      if (slide.type === 'video') {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = slide.localUrl || slide.remote?.media || '';
        v.onloadedmetadata = () => {
          slide.width = v.videoWidth || slide.width;
          slide.height = v.videoHeight || slide.height;
          slide.durationMs = Math.round((v.duration || 0) * 1000);
          if (!slide.trimEnd) slide.trimEnd = Math.min(slide.durationMs, MAX_VIDEO_MS);
          resolve();
        };
        v.onerror = () => resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        slide.width = img.naturalWidth || slide.width;
        slide.height = img.naturalHeight || slide.height;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = slide.localUrl || slide.gifUrl || slide.remote?.media || '';
    });
  }

  function addFiles(files) {
    const list = Array.from(files || []).filter((f) => f && (f.type.startsWith('image/') || f.type.startsWith('video/')));
    const room = MAX_SLIDES - state.slides.length;
    list.slice(0, room).forEach((file) => {
      const isVid = file.type.startsWith('video/');
      const isGif = /gif/i.test(file.type) || /\.gif$/i.test(file.name || '');
      state.slides.push({
        id: uid(),
        type: isVid ? 'video' : isGif ? 'gif' : 'image',
        file,
        localUrl: URL.createObjectURL(file),
        remote: null,
        gifUrl: null,
        crop: { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
        filter: 'normal',
        alt: '',
        muted: false,
        trimStart: 0,
        trimEnd: 0,
        durationMs: 0,
        width: 0,
        height: 0,
        posterUrl: '',
        posterTime: 0,
        needsReattach: false,
      });
    });
    if (list.length && room <= 0) toast('Up to 10 slides');
    persistDraft();
  }

  function addGifSlide(gif) {
    const url = gif?.url || gif?.preview;
    if (!url || !/^https:\/\//i.test(url)) return;
    if (state.slides.length >= MAX_SLIDES) {
      toast('Up to 10 slides');
      return;
    }
    state.slides.push({
      id: uid(),
      type: 'gif',
      file: null,
      localUrl: url,
      remote: { media: url, thumb: url, width: 0, height: 0 },
      gifUrl: url,
      crop: { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
      filter: 'normal',
      alt: gif.title || '',
      muted: true,
      trimStart: 0,
      trimEnd: 0,
      durationMs: 0,
      width: 0,
      height: 0,
      posterUrl: '',
      posterTime: 0,
      needsReattach: false,
    });
    persistDraft();
  }

  function pickFiles({ multiple = true, capture = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      if (multiple) input.multiple = true;
      if (capture) input.setAttribute('capture', 'environment');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.dataset.navIgnore = '1';
      document.body.appendChild(input);
      let settled = false;
      const done = (files) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          try {
            input.remove();
          } catch (e) {}
        }, 0);
        resolve(files || []);
      };
      const onFocus = () => setTimeout(() => {
        if (!input.files?.length) done([]);
      }, 600);
      input.addEventListener('change', () => done(Array.from(input.files || [])));
      window.addEventListener('focus', onFocus);
      input.click();
    });
  }

  function renderFilmstrip(root) {
    const strip = root.querySelector('[data-dc-strip]');
    if (!strip) return;
    strip.innerHTML = state.slides
      .map((s, i) => {
        const src = s.localUrl || s.gifUrl || s.remote?.thumb || '';
        if (s.needsReattach && !src) {
          return `<button type="button" class="dc-thumb is-missing${i === state.index ? ' is-active' : ''}" data-i="${i}">Re-attach</button>`;
        }
        const media =
          s.type === 'video'
            ? `<video src="${esc(src)}" muted playsinline></video>`
            : `<img src="${esc(src)}" alt="">`;
        return `<div class="dc-thumb${i === state.index ? ' is-active' : ''}" data-i="${i}" draggable="true">${media}<button type="button" class="dc-thumb-x" data-del="${i}" aria-label="Remove">✕</button></div>`;
      })
      .join('');
    strip.querySelectorAll('[data-i]').forEach((el) => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        const s = state.slides[i];
        if (s?.needsReattach && !s.file && !s.remote && !s.gifUrl) {
          pickFiles({ multiple: false }).then((files) => {
            if (!files[0]) return;
            s.file = files[0];
            s.localUrl = URL.createObjectURL(files[0]);
            s.needsReattach = false;
            s.type = files[0].type.startsWith('video/') ? 'video' : /gif/i.test(files[0].type) ? 'gif' : 'image';
            state.index = i;
            if (state.screen === 'crop') showCrop();
            else renderFilmstrip(root);
          });
          return;
        }
        state.index = i;
        if (state.screen === 'crop') showCrop();
        else renderFilmstrip(root);
      });
    });
    strip.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = Number(btn.dataset.del);
        const s = state.slides[i];
        if (s?.localUrl?.startsWith('blob:')) try { URL.revokeObjectURL(s.localUrl); } catch (err) {}
        state.slides.splice(i, 1);
        state.taggedPeople = state.taggedPeople.filter((t) => t.slideIndex !== i).map((t) => ({
          ...t,
          slideIndex: t.slideIndex > i ? t.slideIndex - 1 : t.slideIndex,
        }));
        if (state.index >= state.slides.length) state.index = Math.max(0, state.slides.length - 1);
        persistDraft();
        if (!state.slides.length) showPicker();
        else if (state.screen === 'crop') showCrop();
        else renderFilmstrip(root);
      });
    });
    let dragFrom = null;
    strip.querySelectorAll('.dc-thumb[draggable]').forEach((el) => {
      el.addEventListener('dragstart', () => {
        dragFrom = Number(el.dataset.i);
      });
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const to = Number(el.dataset.i);
        if (!Number.isFinite(dragFrom) || dragFrom === to) return;
        const [moved] = state.slides.splice(dragFrom, 1);
        state.slides.splice(to, 0, moved);
        state.index = to;
        persistDraft();
        if (state.screen === 'crop') showCrop();
        else renderFilmstrip(root);
      });
    });
  }

  function showPicker() {
    if (!state) return;
    state.screen = 'picker';
    setTitle('New post', state.slides.length ? 'Next' : 'Next');
    const el = body();
    el.innerHTML = `<div class="dc-picker">
      <div class="dc-picker-tiles">
        <button type="button" class="dc-tile" data-act="gallery"><span aria-hidden="true">🖼</span>Gallery</button>
        <button type="button" class="dc-tile" data-act="camera"><span aria-hidden="true">📷</span>Camera</button>
        <button type="button" class="dc-tile" data-act="text"><span aria-hidden="true">Aa</span>Text</button>
        <button type="button" class="dc-tile" data-act="gif"><span aria-hidden="true">GIF</span>GIF</button>
      </div>
      <div class="dc-filmstrip" data-dc-strip></div>
      <p class="dc-hint">Up to 10 photos, videos, or GIFs. Camera is a control here — gallery opens first.</p>
    </div>`;
    renderFilmstrip(el);
    el.querySelector('[data-act="gallery"]').addEventListener('click', async () => {
      const files = await pickFiles({ multiple: true });
      if (!files.length && !state.slides.length) {
        closeComposer();
        return;
      }
      addFiles(files);
      if (state.slides.length) showCrop();
    });
    el.querySelector('[data-act="camera"]').addEventListener('click', async () => {
      const files = await pickFiles({ multiple: false, capture: true });
      addFiles(files);
      if (state.slides.length) showCrop();
    });
    el.querySelector('[data-act="text"]').addEventListener('click', () => {
      state.mode = 'text';
      showExtras();
    });
    el.querySelector('[data-act="gif"]').addEventListener('click', () => {
      if (typeof openGifPicker !== 'function') {
        toast('GIF picker unavailable');
        return;
      }
      openGifPicker({
        onSelect: (gif) => {
          addGifSlide(gif);
          showCrop();
        },
      });
    });
  }

  function filterCss(id) {
    return FILTERS.find((f) => f.id === id)?.css || 'none';
  }

  function applyCropTransform(img, slide, stage) {
    if (!img || !slide) return;
    const c = slide.crop || { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
    const sw = stage.clientWidth || 1;
    const sh = stage.clientHeight || 1;
    const nw = img.naturalWidth || img.videoWidth || slide.width || sw;
    const nh = img.naturalHeight || img.videoHeight || slide.height || sh;
    const base = Math.max(sw / nw, sh / nh);
    const scale = base * (c.scale || 1);
    const dx = (0.5 - (c.x || 0.5)) * nw * scale;
    const dy = (0.5 - (c.y || 0.5)) * nh * scale;
    img.style.width = nw + 'px';
    img.style.height = nh + 'px';
    img.style.filter = filterCss(slide.filter);
    img.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${scale}) rotate(${c.rotate || 0}deg)`;
  }

  function bindCropGestures(stage, img, slide) {
    cropPointers = new Map();
    let lastDist = 0;
    const getPoint = (e) => ({ x: e.clientX, y: e.clientY });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      cropPointers.set(e.pointerId, getPoint(e));
    });
    stage.addEventListener('pointermove', (e) => {
      if (!cropPointers.has(e.pointerId)) return;
      const prev = cropPointers.get(e.pointerId);
      const now = getPoint(e);
      cropPointers.set(e.pointerId, now);
      const pts = [...cropPointers.values()];
      if (pts.length === 2) {
        const d = dist(pts[0], pts[1]);
        if (lastDist) {
          slide.crop.scale = Math.max(1, Math.min(4, (slide.crop.scale || 1) * (d / lastDist)));
        }
        lastDist = d;
      } else {
        const sw = stage.clientWidth || 1;
        const sh = stage.clientHeight || 1;
        slide.crop.x = Math.max(0, Math.min(1, (slide.crop.x || 0.5) - (now.x - prev.x) / sw));
        slide.crop.y = Math.max(0, Math.min(1, (slide.crop.y || 0.5) - (now.y - prev.y) / sh));
      }
      applyCropTransform(img, slide, stage);
    });
    const up = (e) => {
      cropPointers.delete(e.pointerId);
      if (cropPointers.size < 2) lastDist = 0;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  }

  async function showCrop() {
    if (!state.slides.length) {
      showPicker();
      return;
    }
    state.screen = 'crop';
    setTitle('Edit', 'Next');
    const slide = activeSlide();
    await probeMedia(slide);
    const src = slide.localUrl || slide.gifUrl || slide.remote?.media || '';
    const el = body();
    const aspect = slide.width && slide.height ? slide.width / slide.height : 1;
    const clamped = Math.max(0.56, Math.min(1.8, aspect));
    el.innerHTML = `<div class="dc-crop">
      <div class="dc-crop-stage" data-dc-stage style="aspect-ratio:${clamped};max-height:62vh;width:100%;margin:0 auto;">
        ${
          slide.type === 'video'
            ? `<video class="dc-crop-img" src="${esc(src)}" playsinline ${slide.muted ? 'muted' : ''} data-dc-media></video>`
            : `<img class="dc-crop-img" src="${esc(src)}" alt="" data-dc-media>`
        }
      </div>
      <div class="dc-filmstrip" data-dc-strip style="padding:8px 12px;"></div>
      <div class="dc-crop-tools">
        <button type="button" data-dc-rot>Rotate 90°</button>
        <button type="button" data-dc-reset>Reset</button>
        ${slide.type === 'video' ? `<button type="button" data-dc-mute>${slide.muted ? 'Unmute clip' : 'Mute clip'}</button><button type="button" data-dc-poster>Cover frame</button>` : ''}
        ${FILTERS.map((f) => `<button type="button" class="dc-filter${slide.filter === f.id ? ' is-on' : ''}" data-filter="${f.id}">${esc(f.label)}</button>`).join('')}
      </div>
      ${
        slide.type === 'video'
          ? `<div class="dc-trim">
              <div class="dc-hint">Trim · max 10 minutes</div>
              <label>Start <input type="range" min="0" max="${Math.max(1, slide.durationMs)}" value="${slide.trimStart || 0}" data-trim="start"></label>
              <label>End <input type="range" min="0" max="${Math.max(1, slide.durationMs)}" value="${slide.trimEnd || slide.durationMs}" data-trim="end"></label>
              <div class="dc-hint" data-trim-label></div>
            </div>`
          : ''
      }
    </div>`;
    renderFilmstrip(el);
    const stage = el.querySelector('[data-dc-stage]');
    const media = el.querySelector('[data-dc-media]');
    const paint = () => applyCropTransform(media, slide, stage);
    if (media.tagName === 'VIDEO') media.addEventListener('loadedmetadata', paint);
    else media.addEventListener('load', paint);
    paint();
    bindCropGestures(stage, media, slide);
    el.querySelector('[data-dc-rot]')?.addEventListener('click', () => {
      slide.crop.rotate = ((slide.crop.rotate || 0) + 90) % 360;
      const w = slide.width;
      slide.width = slide.height;
      slide.height = w;
      paint();
    });
    el.querySelector('[data-dc-reset]')?.addEventListener('click', () => {
      slide.crop = { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
      slide.filter = 'normal';
      paint();
      showCrop();
    });
    el.querySelector('[data-dc-mute]')?.addEventListener('click', () => {
      slide.muted = !slide.muted;
      showCrop();
    });
    el.querySelector('[data-dc-poster]')?.addEventListener('click', async () => {
      const v = media;
      if (v.tagName !== 'VIDEO') return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 640;
        canvas.height = v.videoHeight || 360;
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
        if (!blob) return;
        slide.posterFile = new File([blob], 'poster.jpg', { type: 'image/jpeg' });
        slide.posterTime = v.currentTime || 0;
        toast('Cover frame saved');
      } catch (e) {
        report(e);
        toast('Could not capture cover');
      }
    });
    el.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        slide.filter = btn.dataset.filter;
        paint();
        el.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('is-on', b === btn));
      });
    });
    const label = el.querySelector('[data-trim-label]');
    const syncTrim = () => {
      const start = Number(el.querySelector('[data-trim="start"]')?.value) || 0;
      let end = Number(el.querySelector('[data-trim="end"]')?.value) || slide.durationMs;
      if (end - start > MAX_VIDEO_MS) end = start + MAX_VIDEO_MS;
      if (end <= start) end = Math.min(slide.durationMs, start + 1000);
      slide.trimStart = start;
      slide.trimEnd = end;
      if (label) label.textContent = `${(start / 1000).toFixed(1)}s – ${(end / 1000).toFixed(1)}s`;
    };
    el.querySelectorAll('[data-trim]').forEach((inp) => inp.addEventListener('input', syncTrim));
    syncTrim();
  }

  function searchBox(placeholder, onPick, { exclude = [] } = {}) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="dc-search"><input type="search" placeholder="${esc(placeholder)}" data-q></div><div data-hits></div>`;
    const input = wrap.querySelector('[data-q]');
    const hits = wrap.querySelector('[data-hits]');
    let timer = null;
    const run = async () => {
      const q = input.value.trim();
      if (!q || typeof searchUsersProvider !== 'function') {
        hits.innerHTML = '';
        return;
      }
      try {
        const rows = (await searchUsersProvider(q, { limit: 8 })) || [];
        const me = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
        const blocked = typeof getBlockedUids === 'function' ? getBlockedUids() : [];
        const list = rows.filter(
          (u) => u.uid && u.uid !== me && !exclude.includes(u.uid) && !(blocked || []).includes(u.uid)
        );
        hits.innerHTML = list
          .map(
            (u) =>
              `<button type="button" class="dc-user-hit" data-uid="${esc(u.uid)}"><strong>${esc(u.name || u.username)}</strong><span style="color:var(--muted);font-size:12px;">@${esc(u.username || '')}</span></button>`
          )
          .join('') || `<div class="dc-hint" style="padding:8px 16px;">No people found</div>`;
        hits.querySelectorAll('.dc-user-hit').forEach((btn) => {
          btn.addEventListener('click', () => {
            const u = list.find((x) => x.uid === btn.dataset.uid);
            if (u) onPick(u);
          });
        });
      } catch (e) {
        report(e);
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 220);
    });
    return wrap;
  }

  function showUserPicker(title, onPick, opts) {
    const sheet = document.createElement('div');
    sheet.className = 'duniya-compose';
    sheet.style.zIndex = '90';
    sheet.innerHTML = `<div class="duniya-compose-bar"><button type="button" data-x aria-label="Close">✕</button><h2>${esc(title)}</h2><span></span></div>`;
    const box = searchBox('Search people', (u) => {
      onPick(u);
      close();
    }, opts);
    sheet.appendChild(box);
    device().appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    sheet.querySelector('[data-x]').addEventListener('click', close);
    if (typeof openLayer === 'function') openLayer(sheet, close, { role: 'dialog', label: title });
    else if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }
    box.querySelector('input')?.focus();
  }

  function bindMentionSearch(textarea) {
    if (!textarea || textarea.dataset.mentionBound) return;
    textarea.dataset.mentionBound = '1';
    let drop = null;
    textarea.addEventListener('input', async () => {
      state.caption = textarea.value;
      persistDraft();
      const val = textarea.value;
      const at = val.lastIndexOf('@');
      if (at < 0 || val.slice(at + 1).includes(' ')) {
        drop?.remove();
        drop = null;
        return;
      }
      const q = val.slice(at + 1);
      if (!q || typeof searchUsersProvider !== 'function') return;
      const me = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
      const rows = ((await searchUsersProvider(q, { limit: 6 })) || []).filter((u) => u.uid && u.uid !== me);
      drop?.remove();
      if (!rows.length) return;
      drop = document.createElement('div');
      drop.className = 'tag-dropdown';
      drop.innerHTML = rows
        .map(
          (u) =>
            `<button type="button" class="tag-user-item" data-uid="${esc(u.uid)}" data-username="${esc(u.username || '')}">${esc(u.name || '')} <span>@${esc(u.username || '')}</span></button>`
        )
        .join('');
      textarea.parentElement.style.position = 'relative';
      textarea.parentElement.appendChild(drop);
      drop.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          textarea.value = val.slice(0, at) + '@' + btn.dataset.username + ' ';
          state.caption = textarea.value;
          const u = rows.find((x) => x.uid === btn.dataset.uid);
          if (u && !state.mentioned.some((m) => m.uid === u.uid)) state.mentioned.push({ uid: u.uid, username: u.username, name: u.name });
          drop.remove();
          drop = null;
          textarea.focus();
        });
      });
    });
  }

  function showExtras() {
    state.screen = 'extras';
    const edit = state.mode === 'edit';
    setTitle(edit ? 'Edit post' : 'New post', edit ? 'Save' : 'Share');
    const slide = activeSlide();
    const previewSrc = slide ? slide.localUrl || slide.gifUrl || slide.remote?.media || slide.remote?.thumb || '' : '';
    const el = body();
    el.innerHTML = `
      ${
        previewSrc
          ? `<img class="dc-preview-tap" src="${esc(previewSrc)}" alt="" data-dc-preview>`
          : `<div class="dc-text-hero-edit">${esc(state.caption || 'Text post')}</div>`
      }
      ${state.tagMode && slide && (slide.type === 'image' || slide.type === 'gif') ? `<div class="dc-tag-stage" data-tag-stage></div>` : ''}
      <div class="dc-caption-wrap">
        <textarea data-dc-caption maxlength="${MAX_CAPTION}" placeholder="${state.slides.length ? 'Write a caption… @mention or #hashtag' : 'Write something… caption is required'}">${esc(state.caption)}</textarea>
        <div class="dc-counter" data-dc-count></div>
        ${edit ? '' : `<input data-dc-first placeholder="First comment (optional)" value="${esc(state.firstComment)}" style="width:100%;margin-top:8px;padding:8px 0;border:none;border-top:1px solid var(--line);background:transparent;font-size:13px;">`}
      </div>
      ${edit ? '' : `<div class="dc-filmstrip" data-dc-strip></div>`}
      <button type="button" class="dc-row" data-row="tags"><span>Tag people<small>${state.taggedPeople.length ? state.taggedPeople.length + ' tagged' : 'Tap the photo'}</small></span>›</button>
      <button type="button" class="dc-row" data-row="location"><span>Add location<small>${esc(state.location?.placeName || state.location?.label || 'None')}</small></span>›</button>
      <button type="button" class="dc-row" data-row="music"><span>Add music<small>${esc(state.music?.title || 'None')}</small></span>›</button>
      <button type="button" class="dc-row" data-row="alt"><span>Alt text<small>Per image</small></span>›</button>
      <button type="button" class="dc-row" data-row="audience"><span>Audience<small>${state.saveOnly ? 'Save without posting' : 'Everyone'}</small></span>›</button>
      <p class="dc-audience-note">Saved posts go to your archive, not the feed.</p>
      <div class="dc-row" data-row="likes"><span>Hide like count</span><button type="button" class="dc-toggle${state.hideLikeCount ? ' is-on' : ''}" data-tog="likes" aria-pressed="${state.hideLikeCount}"></button></div>
      <div class="dc-row" data-row="comments"><span>Turn comments off</span><button type="button" class="dc-toggle${state.commentsOff ? ' is-on' : ''}" data-tog="comments" aria-pressed="${state.commentsOff}"></button></div>
      <button type="button" class="dc-row" data-row="collab"><span>Collaborator<small>${state.collabInvites.length ? state.collabInvites.map((u) => u.name || u.username).join(', ') : 'Invite up to 3'}</small></span>›</button>
      <div class="dc-progress hidden" data-dc-progress><div data-dc-progress-msg></div><div class="dc-progress-bar"><span data-dc-bar></span></div></div>
    `;
    if (!edit) renderFilmstrip(el);
    const ta = el.querySelector('[data-dc-caption]');
    const count = el.querySelector('[data-dc-count]');
    const syncCount = () => {
      const n = (ta.value || '').length;
      count.textContent = n > 3600 ? `${n}/${MAX_CAPTION}` : '';
      state.caption = ta.value;
      const hero = el.querySelector('.dc-text-hero-edit');
      if (hero) hero.textContent = ta.value || 'Text post';
    };
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(220, ta.scrollHeight) + 'px';
      syncCount();
      persistDraft();
    });
    bindMentionSearch(ta);
    syncCount();
    el.querySelector('[data-dc-first]')?.addEventListener('input', (e) => {
      state.firstComment = e.target.value;
      persistDraft();
    });
    el.querySelector('[data-dc-preview]')?.addEventListener('click', () => {
      if (edit) return;
      showCrop();
    });
    el.querySelector('[data-row="tags"]')?.addEventListener('click', () => {
      if (!slide || (slide.type !== 'image' && slide.type !== 'gif')) {
        toast('Tag people on a photo');
        return;
      }
      enterTagMode();
    });
    el.querySelector('[data-row="location"]')?.addEventListener('click', () => {
      if (typeof openLocationComposer !== 'function') {
        toast('Location unavailable');
        return;
      }
      openLocationComposer({
        title: 'Add location',
        onSelect: (loc) => {
          state.location = loc;
          persistDraft();
          showExtras();
        },
      });
    });
    el.querySelector('[data-row="music"]')?.addEventListener('click', () => {
      const picker = typeof openSongPicker === 'function' ? openSongPicker : typeof openMusicPicker === 'function' ? openMusicPicker : null;
      if (!picker) {
        toast('Music picker unavailable');
        return;
      }
      picker({
        title: 'Add music',
        onSelect: (track) => {
          state.music = track;
          persistDraft();
          showExtras();
        },
      });
    });
    el.querySelector('[data-row="alt"]')?.addEventListener('click', () => showAltEditor());
    el.querySelector('[data-row="audience"]')?.addEventListener('click', () => {
      state.saveOnly = !state.saveOnly;
      persistDraft();
      showExtras();
    });
    el.querySelector('[data-tog="likes"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.hideLikeCount = !state.hideLikeCount;
      persistDraft();
      showExtras();
    });
    el.querySelector('[data-tog="comments"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.commentsOff = !state.commentsOff;
      persistDraft();
      showExtras();
    });
    el.querySelector('[data-row="collab"]')?.addEventListener('click', () => {
      if (state.collabInvites.length >= MAX_COLLAB) {
        toast('Up to 3 collaborators');
        return;
      }
      showUserPicker(
        'Invite collaborator',
        (u) => {
          if (state.collabInvites.some((x) => x.uid === u.uid)) return;
          state.collabInvites.push({ uid: u.uid, name: u.name, username: u.username });
          persistDraft();
          showExtras();
        },
        { exclude: state.collabInvites.map((x) => x.uid) }
      );
    });
  }

  function enterTagMode() {
    const slide = activeSlide();
    if (!slide) return;
    const sheet = document.createElement('div');
    sheet.className = 'duniya-compose';
    sheet.style.zIndex = '90';
    const src = slide.localUrl || slide.gifUrl || slide.remote?.media || '';
    sheet.innerHTML = `<div class="duniya-compose-bar"><button type="button" data-x>✕</button><h2>Tag people</h2><button type="button" class="dc-share" data-done>Done</button></div>
      <div class="dc-tag-stage" data-stage style="min-height:280px;">
        <img src="${esc(src)}" alt="" style="width:100%;display:block;">
        <div data-chips></div>
      </div>`;
    device().appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      showExtras();
    };
    const paintChips = () => {
      const box = sheet.querySelector('[data-chips]');
      box.innerHTML = state.taggedPeople
        .filter((t) => t.slideIndex === state.index)
        .map(
          (t) =>
            `<span class="dc-tag-chip" style="left:${t.x * 100}%;top:${t.y * 100}%;">${esc(t.username || t.name)}</span>`
        )
        .join('');
    };
    paintChips();
    sheet.querySelector('[data-stage]').addEventListener('click', (e) => {
      if (state.taggedPeople.length >= MAX_TAGS) {
        toast('Tag limit reached');
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      showUserPicker('Tag someone', (u) => {
        if (state.taggedPeople.some((t) => t.uid === u.uid && t.slideIndex === state.index)) return;
        state.taggedPeople.push({
          uid: u.uid,
          name: u.name,
          username: u.username,
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          slideIndex: state.index,
        });
        persistDraft();
        paintChips();
      });
    });
    sheet.querySelector('[data-x]').addEventListener('click', close);
    sheet.querySelector('[data-done]').addEventListener('click', close);
    if (typeof openLayer === 'function') openLayer(sheet, close, { role: 'dialog', label: 'Tag people' });
  }

  function showAltEditor() {
    const imgs = state.slides.filter((s) => s.type === 'image' || s.type === 'gif');
    const sheet = document.createElement('div');
    sheet.className = 'duniya-compose';
    sheet.style.zIndex = '90';
    sheet.innerHTML = `<div class="duniya-compose-bar"><button type="button" data-x>✕</button><h2>Alt text</h2><button type="button" class="dc-share" data-done>Done</button></div>
      <div style="padding:12px 16px;overflow:auto;">
        ${
          imgs
            .map(
              (s, i) =>
                `<label style="display:block;margin-bottom:14px;font-size:13px;">Slide ${i + 1}<textarea data-alt="${esc(s.id)}" maxlength="200" style="width:100%;min-height:64px;margin-top:6px;border:1.5px solid var(--line);border-radius:10px;padding:8px;">${esc(s.alt || '')}</textarea></label>`
            )
            .join('') || '<p class="dc-hint">No image slides</p>'
        }
      </div>`;
    device().appendChild(sheet);
    const close = () => {
      sheet.querySelectorAll('[data-alt]').forEach((ta) => {
        const s = state.slides.find((x) => x.id === ta.dataset.alt);
        if (s) s.alt = ta.value;
      });
      persistDraft();
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      showExtras();
    };
    sheet.querySelector('[data-x]').addEventListener('click', close);
    sheet.querySelector('[data-done]').addEventListener('click', close);
    if (typeof openLayer === 'function') openLayer(sheet, close, { role: 'dialog', label: 'Alt text' });
  }

  function slideAspect(slide) {
    const rot = (slide.crop?.rotate || 0) % 180;
    let w = slide.width || 1;
    let h = slide.height || 1;
    if (rot === 90) {
      const t = w;
      w = h;
      h = t;
    }
    return { width: Math.round(w), height: Math.round(h) };
  }

  async function uploadSlide(slide, onProgress) {
    if (slide.remote?.media && /^https:\/\//i.test(slide.remote.media) && !slide.file) {
      return slide.remote;
    }
    if (slide.gifUrl && /^https:\/\//i.test(slide.gifUrl) && !slide.file) {
      return { media: slide.gifUrl, thumb: slide.gifUrl, width: slide.width, height: slide.height };
    }
    if (!slide.file) throw new Error('Re-attach this slide to upload');
    if (typeof processAndUploadMedia !== 'function') throw new Error('Upload unavailable');
    const opts = {
      folder: slide.type === 'video' ? 'videos' : 'posts',
      onProgress,
      trimStartMs: slide.trimStart,
      trimEndMs: slide.trimEnd,
      maxDurationMs: MAX_VIDEO_MS,
    };
    const uploaded = await processAndUploadMedia(slide.file, opts);
    let poster = '';
    if (slide.posterFile && typeof processAndUploadMedia === 'function') {
      try {
        const p = await processAndUploadMedia(slide.posterFile, { folder: 'posts', onProgress });
        poster = p.media;
      } catch (e) {
        report(e);
      }
    }
    const size = slideAspect(slide);
    return {
      media: uploaded.media,
      thumb: uploaded.thumb || uploaded.media,
      mediaPath: uploaded.mediaPath,
      thumbPath: uploaded.thumbPath,
      width: size.width || uploaded.width,
      height: size.height || uploaded.height,
      durationMs: slide.type === 'video' ? Math.max(0, (slide.trimEnd || slide.durationMs) - (slide.trimStart || 0)) : 0,
      poster,
    };
  }

  async function onPrimary() {
    if (!state) return;
    if (state.screen === 'picker') {
      if (state.slides.length) showCrop();
      else toast('Pick media or choose Text');
      return;
    }
    if (state.screen === 'crop') {
      const long = state.slides.find((s) => s.type === 'video' && (s.trimEnd || s.durationMs) - (s.trimStart || 0) > MAX_VIDEO_MS);
      if (long) {
        toast('Trim videos to 10 minutes or less');
        return;
      }
      showExtras();
      return;
    }
    if (state.screen === 'extras') await share();
  }

  async function apiPosts(payload) {
    if (typeof apiFetch !== 'function') throw new Error('API unavailable');
    const envelope = await apiFetch('/api/duniya-posts', { method: 'POST', needAuth: true, body: payload });
    if (!envelope?.ok) {
      const err = new Error(envelope?.error?.message || 'Could not save post');
      err.code = envelope?.error?.code;
      throw err;
    }
    return envelope.data;
  }

  async function share() {
    const caption = String(state.caption || '').trim();
    if (!state.slides.length && !caption) {
      toast('Write a caption for a text post');
      return;
    }
    const missing = state.slides.filter((s) => s.needsReattach && !s.file && !s.remote && !s.gifUrl);
    if (missing.length) {
      toast('Re-attach photos that were lost after refresh');
      return;
    }
    const shareBtn = host.querySelector('[data-dc-next]');
    const progress = host.querySelector('[data-dc-progress]');
    const msgEl = host.querySelector('[data-dc-progress-msg]');
    const bar = host.querySelector('[data-dc-bar]');
    const unlock = typeof beginClientMutation === 'function' ? beginClientMutation('duniya_post') : () => {};
    if (unlock === false) {
      toast(tt('duniya_post_submitting', 'Post already submitting…'));
      return;
    }
    shareBtn.disabled = true;
    if (progress) progress.classList.remove('hidden');

    if (typeof checkRateLimit === 'function') {
      const rl = await checkRateLimit('post');
      if (!rl.ok) {
        shareBtn.disabled = false;
        if (typeof unlock === 'function') unlock();
        toast(rl.message || tt('duniya_slow_down', 'Slow down a little'));
        return;
      }
    }

    try {
      const uploaded = [];
      for (let i = 0; i < state.slides.length; i += 1) {
        const s = state.slides[i];
        if (msgEl) msgEl.textContent = `Uploading ${i + 1}/${state.slides.length}`;
        const remote = await uploadSlide(s, (m, pct) => {
          if (msgEl) msgEl.textContent = m || `Uploading ${i + 1}/${state.slides.length}`;
          if (bar && Number.isFinite(pct)) bar.style.width = Math.round(pct) + '%';
        });
        s.remote = remote;
        uploaded.push({
          type: s.type,
          media: remote.media,
          thumb: remote.thumb,
          mediaPath: remote.mediaPath || '',
          thumbPath: remote.thumbPath || '',
          width: remote.width || 0,
          height: remote.height || 0,
          durationMs: remote.durationMs || 0,
          alt: s.alt || '',
          crop: s.crop,
          filter: s.filter,
          poster: remote.poster || '',
          muted: !!s.muted,
        });
      }

      if (state.mode === 'edit' && state.editPost) {
        const data = await apiPosts({
          action: 'update',
          postId: state.editPost.firestoreId || state.editPost.id,
          caption,
          taggedPeople: state.taggedPeople,
          location: state.location,
          music: state.music,
          hideLikeCount: state.hideLikeCount,
          commentsOff: state.commentsOff,
          archived: state.saveOnly,
          alts: state.slides.map((s) => s.alt || ''),
          mentionedUids: state.mentioned.map((m) => m.uid),
        });
        applyLivePost(data.post);
        draftCtl?.clear?.();
        toast('Post updated');
        closeComposer();
        if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
        if (typeof renderLeharFeed === 'function') renderLeharFeed();
        return;
      }

      const data = await apiPosts({
        action: 'create',
        caption,
        slides: uploaded,
        music: state.music,
        location: state.location,
        taggedPeople: state.taggedPeople,
        mentionedUids: state.mentioned.map((m) => m.uid),
        hideLikeCount: state.hideLikeCount,
        commentsOff: state.commentsOff,
        saveOnly: state.saveOnly,
        collabInvites: state.collabInvites.map((u) => u.uid),
        firstComment: state.firstComment,
        coverSlideIndex: state.coverIndex,
        clientId: clientId(),
      });
      const post = data.post;
      applyLivePost(post);
      draftCtl?.clear?.();
      if (typeof trackPostCreated === 'function' && !state.saveOnly) trackPostCreated('duniya');
      if (typeof SoundLib !== 'undefined' && SoundLib.postPublish) SoundLib.postPublish();
      if (typeof haptic === 'function') haptic('success');
      toast(state.saveOnly ? tt('duniya_saved_archive', 'Saved to archive') : tt('duniya_posted', 'Posted to Duniya! 🌍'));
      if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
      if (typeof renderLeharFeed === 'function') renderLeharFeed();
      showAfterShare(post);
    } catch (err) {
      report(err);
      shareBtn.disabled = false;
      shareBtn.textContent = 'Retry';
      if (msgEl) msgEl.textContent = typeof friendlyError === 'function' ? friendlyError(err) : err.message || 'Could not post';
      toast(typeof friendlyError === 'function' ? friendlyError(err) : err.message || 'Could not post — retry');
    } finally {
      if (typeof unlock === 'function') unlock();
    }
  }

  function applyLivePost(post) {
    if (!post) return;
    const mapped = typeof mapDuniyaDoc === 'function' ? mapDuniyaDoc({ ...post, id: post.id }) : post;
    mapped.id = post.id;
    mapped.firestoreId = post.id;
    if (typeof duniyaPosts !== 'undefined' && Array.isArray(duniyaPosts) && !post.archived) {
      const i = duniyaPosts.findIndex((p) => (p.firestoreId || p.id) === post.id);
      if (i >= 0) duniyaPosts[i] = { ...duniyaPosts[i], ...mapped };
      else duniyaPosts.unshift(mapped);
    }
    if (typeof saveToArchive === 'function') saveToArchive({ type: 'duniya_post', ...mapped });
  }

  function showAfterShare(post) {
    state.screen = 'after';
    setTitle('Shared', 'Done');
    const el = body();
    const first = (post.slides && post.slides[0]) || null;
    el.innerHTML = `<div class="dc-after">
      <h3>${post.archived ? 'Saved' : 'Posted'}</h3>
      <button type="button" data-act="story">Also add to your story</button>
      <button type="button" data-act="send">Send to friends</button>
      <button type="button" data-act="done">Done</button>
    </div>`;
    host.querySelector('[data-dc-next]').onclick = () => closeComposer();
    el.querySelector('[data-act="done"]').addEventListener('click', closeComposer);
    el.querySelector('[data-act="story"]').addEventListener('click', () => {
      const seed = {
        media: first?.media || post.media,
        mediaType: first?.type === 'video' ? 'video' : 'image',
        postId: post.id,
      };
      if (typeof window.openDuniyaStoryComposer === 'function') {
        window.openDuniyaStoryComposer({ seedMedia: seed });
      } else if (typeof DuniyaStory !== 'undefined' && typeof DuniyaStory.openEditor === 'function' && seed.media) {
        DuniyaStory.openEditor({
          mediaUrl: seed.media,
          mediaType: seed.mediaType,
          restoryOf: { uid: meUser().uid, name: meUser().name, storyId: post.id },
        });
      } else {
        toast('Story composer will open when ready');
      }
    });
    el.querySelector('[data-act="send"]').addEventListener('click', () => showSendFriends(post));
  }

  function showSendFriends(post) {
    const picked = [];
    const sheet = document.createElement('div');
    sheet.className = 'duniya-compose';
    sheet.style.zIndex = '90';
    sheet.innerHTML = `<div class="duniya-compose-bar"><button type="button" data-x>✕</button><h2>Send to friends</h2><button type="button" class="dc-share" data-send>Send</button></div>
      <div data-picked class="dc-hint" style="padding:8px 16px;"></div>`;
    const box = searchBox('Search friends', (u) => {
      if (picked.some((x) => x.uid === u.uid)) return;
      picked.push(u);
      sheet.querySelector('[data-picked]').textContent = picked.map((x) => x.name || x.username).join(', ');
    });
    sheet.appendChild(box);
    device().appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    sheet.querySelector('[data-x]').addEventListener('click', close);
    sheet.querySelector('[data-send]').addEventListener('click', async () => {
      if (!picked.length) {
        toast('Pick at least one friend');
        return;
      }
      try {
        if (typeof assertCanMessage === 'function') {
          for (const u of picked) {
            const ok = await assertCanMessage(u);
            if (ok === false) throw new Error('Cannot message ' + (u.name || 'this person'));
          }
        }
        await apiPosts({ action: 'send_post', postId: post.id, uids: picked.map((u) => u.uid) });
        toast('Sent');
        close();
      } catch (e) {
        report(e);
        toast(typeof friendlyError === 'function' ? friendlyError(e) : e.message || 'Could not send');
      }
    });
    if (typeof openLayer === 'function') openLayer(sheet, close, { role: 'dialog', label: 'Send to friends' });
  }

  async function open(opts = {}) {
    if (typeof currentUser === 'undefined' || !currentUser) {
      if (typeof showAuth === 'function') showAuth();
      return;
    }
    const mode = opts.mode === 'text' ? 'text' : opts.editPost ? 'edit' : 'media';
    state = blankState(mode);
    if (opts.editPost) {
      state.editPost = opts.editPost;
      state.mode = 'edit';
      hydrateFromPost(opts.editPost);
      mountHost('Edit post');
      showExtras();
      return;
    }
    mountHost(mode === 'text' ? 'Text post' : 'New post');
    try {
      const saved = typeof loadDraft === 'function' ? loadDraft('duniya') : null;
      if (saved) applyDraft(saved);
    } catch (e) {}
    if (mode === 'text') {
      showExtras();
      return;
    }
    showPicker();
    if (state.caption || state.slides.length) {
      if (state.slides.length) showCrop();
      else showExtras();
      return;
    }
    const files = await pickFiles({ multiple: true });
    if (!files.length && !state.slides.length) {
      closeComposer();
      return;
    }
    addFiles(files);
    if (state.slides.length) showCrop();
  }

  function hydrateFromPost(post) {
    const slides = Array.isArray(post.slides) && post.slides.length
      ? post.slides
      : post.media
        ? [{ type: post.type || 'image', media: post.media, thumb: post.thumb, width: post.mediaWidth, height: post.mediaHeight, alt: '', crop: null, filter: 'normal' }]
        : [];
    state.slides = slides.map((s) => ({
      id: uid(),
      type: s.type || 'image',
      file: null,
      localUrl: s.media || s.thumb || '',
      remote: { media: s.media, thumb: s.thumb, width: s.width, height: s.height, poster: s.poster },
      gifUrl: s.type === 'gif' ? s.media : null,
      crop: s.crop || { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
      filter: s.filter || 'normal',
      alt: s.alt || '',
      muted: !!s.muted,
      trimStart: 0,
      trimEnd: s.durationMs || 0,
      durationMs: s.durationMs || 0,
      width: s.width || 0,
      height: s.height || 0,
      posterUrl: s.poster || '',
      posterTime: 0,
      needsReattach: false,
    }));
    state.caption = post.caption || '';
    state.location = post.location || null;
    state.music = post.music || null;
    state.taggedPeople = Array.isArray(post.taggedPeople) ? post.taggedPeople.slice() : [];
    state.hideLikeCount = !!post.hideLikeCount;
    state.commentsOff = !!post.commentsOff;
    state.saveOnly = !!(post.archived || post.saveOnly);
    state.collabInvites = [];
    state.mentioned = (post.mentionedUids || []).map((id) => ({ uid: id }));
  }

  NS.open = open;
  NS.openEdit = (post) => open({ editPost: post, mode: 'edit' });
  NS.close = closeComposer;

  window.openDuniyaStoryComposer = window.openDuniyaStoryComposer || function openDuniyaStoryComposer(opts) {
    const seed = opts?.seedMedia || opts || {};
    if (typeof DuniyaStory !== 'undefined' && typeof DuniyaStory.openEditor === 'function' && seed.media) {
      DuniyaStory.openEditor({
        mediaUrl: seed.media || seed.mediaUrl,
        mediaType: seed.mediaType || seed.type || 'image',
        restoryOf: {
          uid: meUser().uid,
          name: meUser().name,
          storyId: seed.postId || 'duniya',
        },
      });
    }
  };
})();
