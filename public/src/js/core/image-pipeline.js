/**
 * Image optimization pipeline (Phase 2.5 → Cloudinary).
 *
 * Why Cloudinary (not ImageKit): unsigned upload presets work fully client-side
 * with only cloud name + preset (no private key / signature server). ImageKit
 * usually needs a backend-signed token. Free tier (~25 credits/mo) is enough
 * while we compress heavily before upload.
 *
 * Flow: File → canvas compress (client) → Cloudinary upload → store URLs in Firestore.
 * Thumbnails: one upload + Cloudinary URL transform (w_480 / w_128) — saves a second
 * upload credit versus uploading two blobs.
 *
 * Config: GET /api/media-config (Vercel env) or window.CHAUPAAL_CLOUDINARY override.
 * Firebase Storage is unused — skip Blaze/Storage setup entirely.
 */
(function () {
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  /** Cloudinary unsigned presets commonly allow ~100MB; product cap is 10 minutes. */
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  const MAX_VIDEO_MS = 10 * 60 * 1000;

  const PRESETS = {
    feed: { maxEdge: 1200, quality: 0.82, mime: 'image/jpeg' },
    thumb: { maxEdge: 480, quality: 0.72, mime: 'image/jpeg' },
    avatar: { maxEdge: 512, quality: 0.85, mime: 'image/jpeg' },
    avatarThumb: { maxEdge: 128, quality: 0.8, mime: 'image/jpeg' },
  };

  let cachedConfig = null;
  let configPromise = null;

  function isImageFile(file) {
    return !!(file && file.type && file.type.startsWith('image/'));
  }

  function isVideoFile(file) {
    return !!(file && file.type && file.type.startsWith('video/'));
  }

  async function getMediaConfig() {
    if (cachedConfig) return cachedConfig;
    if (window.CHAUPAAL_CLOUDINARY?.cloudName && window.CHAUPAAL_CLOUDINARY?.uploadPreset) {
      cachedConfig = {
        provider: 'cloudinary',
        cloudName: window.CHAUPAAL_CLOUDINARY.cloudName,
        uploadPreset: window.CHAUPAAL_CLOUDINARY.uploadPreset,
      };
      return cachedConfig;
    }
    if (!configPromise) {
      configPromise = (async () => {
        try {
          let data = null;
          if (typeof apiFetch === 'function') {
            const envelope = await apiFetch('/api/media-config', { method: 'GET', needAuth: true });
            data = envelope?.ok ? envelope.data : null;
          } else {
            const headers = {};
            try {
              const u = typeof auth !== 'undefined' ? auth.currentUser : null;
              if (u) headers.Authorization = `Bearer ${await u.getIdToken()}`;
            } catch (e) {}
            const r = await fetch('/api/media-config', { headers });
            const json = await r.json().catch(() => null);
            data = r.ok && json?.ok === true ? json.data : r.ok ? json : null;
          }
          if (data?.cloudName && data?.uploadPreset) {
            cachedConfig = {
              provider: 'cloudinary',
              cloudName: data.cloudName,
              uploadPreset: data.uploadPreset,
            };
          } else {
            cachedConfig = null;
          }
          return cachedConfig;
        } catch (e) {
          cachedConfig = null;
          return null;
        }
      })();
    }
    return configPromise;
  }

  async function isMediaUploadReady() {
    const cfg = await getMediaConfig();
    return !!(cfg && cfg.cloudName && cfg.uploadPreset);
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e || new Error('Could not decode image'));
      };
      img.src = url;
    });
  }

  /** Resize longest edge to maxEdge, export as JPEG blob. */
  async function compressImageFile(file, presetName = 'feed') {
    if (!isImageFile(file)) throw new Error('Not an image file');
    const preset = PRESETS[presetName] || PRESETS.feed;
    const img = await loadImageFromFile(file);
    let { width, height } = img;
    const max = preset.maxEdge;
    if (width > max || height > max) {
      if (width >= height) {
        height = Math.round((height * max) / width);
        width = max;
      } else {
        width = Math.round((width * max) / height);
        height = max;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), preset.mime, preset.quality);
    });
    if (!blob) throw new Error('Compression failed');

    return {
      blob,
      width,
      height,
      mime: preset.mime,
      previewUrl: URL.createObjectURL(blob),
    };
  }

  /**
   * Insert Cloudinary transformation segment after /upload/.
   * Works for both image and video delivery URLs.
   */
  function cloudinaryTransformedUrl(secureUrl, transform) {
    if (!secureUrl || !transform) return secureUrl || '';
    if (!/\/upload\//.test(secureUrl)) return secureUrl;
    return secureUrl.replace('/upload/', `/upload/${transform}/`);
  }

  function folderPath(folder) {
    const uid = currentUser?.uid || 'anon';
    return `chaupaal/${folder}/${uid}`;
  }

  function readVideoMeta(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        const meta = {
          durationMs: Math.round((video.duration || 0) * 1000),
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read video'));
      };
      video.src = url;
    });
  }

  /**
   * Best-effort bitrate transcode via MediaRecorder. Never silently cuts to 15s.
   * If the browser cannot transcode, the caller keeps the original file.
   */
  async function transcodeVideoFile(file, { maxBytes = MAX_VIDEO_BYTES, onProgress } = {}) {
    if (!file || file.size <= maxBytes) return file;
    if (typeof MediaRecorder === 'undefined') return file;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Could not decode video for compress'));
    });
    if (typeof video.captureStream !== 'function' && typeof video.mozCaptureStream !== 'function') {
      URL.revokeObjectURL(url);
      return file;
    }
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    if (!mime) {
      URL.revokeObjectURL(url);
      return file;
    }
    if (typeof onProgress === 'function') onProgress('Compressing video…', 5);
    const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1500000 });
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const done = new Promise((resolve, reject) => {
      rec.onstop = () => resolve();
      rec.onerror = () => reject(new Error('Compress failed'));
    });
    rec.start(250);
    try {
      await video.play();
    } catch (e) {
      rec.stop();
      URL.revokeObjectURL(url);
      return file;
    }
    await new Promise((resolve) => {
      video.onended = resolve;
      setTimeout(resolve, Math.min(MAX_VIDEO_MS + 2000, (video.duration || 0) * 1000 + 2000));
    });
    if (rec.state !== 'inactive') rec.stop();
    await done;
    URL.revokeObjectURL(url);
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'clip').replace(/\.[^.]+$/, '') + '.webm', { type: mime });
  }

  async function uploadToCloudinary(blobOrFile, { resourceType = 'image', folder = 'posts', filename, onProgress } = {}) {
    const cfg = await getMediaConfig();
    if (!cfg) {
      throw new Error('Media upload is not configured. Set Cloudinary on Vercel (see .env.example).');
    }
    if (!currentUser) throw new Error('Sign in to upload media');

    const size = blobOrFile.size || 0;
    if (resourceType === 'image' && size > MAX_UPLOAD_BYTES) {
      throw new Error('File too large after compression');
    }
    if (resourceType === 'video' && size > MAX_VIDEO_BYTES) {
      const err = new Error('This clip is still too large after compress. Trim it or pick a lower-quality export.');
      err.code = 'VIDEO_TOO_HEAVY';
      throw err;
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`;
    const form = new FormData();
    form.append('file', blobOrFile, filename || (resourceType === 'video' ? 'clip.mp4' : 'photo.jpg'));
    form.append('upload_preset', cfg.uploadPreset);
    form.append('folder', folderPath(folder));
    if (currentUser?.uid) form.append('context', `uid=${currentUser.uid}`);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable || typeof onProgress !== 'function') return;
        const pct = Math.max(0, Math.min(99, Math.round((e.loaded / e.total) * 100)));
        onProgress(`Uploading… ${pct}%`, pct);
      };
      xhr.onload = () => {
        let json = {};
        try {
          json = JSON.parse(xhr.responseText || '{}');
        } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(json);
        else reject(new Error(json?.error?.message || `Cloudinary upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed — check your connection and retry'));
      xhr.send(form);
    });
  }

  /**
   * Compress once → upload once → derive thumb via CDN transform (no 2nd upload).
   */
  async function uploadOptimizedImage(file, { folder = 'posts', onProgress } = {}) {
    if (!isImageFile(file)) throw new Error('Expected an image');
    if (typeof onProgress === 'function') onProgress('Compressing…');
    const isAvatar = folder === 'avatars';
    const full = await compressImageFile(file, isAvatar ? 'avatar' : 'feed');

    if (typeof onProgress === 'function') onProgress('Uploading…');
    const uploaded = await uploadToCloudinary(full.blob, {
      resourceType: 'image',
      folder,
      filename: 'photo.jpg',
      onProgress,
    });

    const media = uploaded.secure_url;
    const thumbTransform = isAvatar ? 'c_fill,g_face,w_128,h_128,q_auto,f_auto' : 'c_limit,w_480,q_auto,f_auto';
    const thumb = cloudinaryTransformedUrl(media, thumbTransform);

    return {
      media,
      thumb,
      mediaPath: uploaded.public_id || null,
      thumbPath: uploaded.public_id || null,
      width: uploaded.width || full.width,
      height: uploaded.height || full.height,
      previewUrl: full.previewUrl,
      mime: full.mime,
      provider: 'cloudinary',
    };
  }

  async function uploadVideoFile(file, { folder = 'videos', onProgress, maxDurationMs = MAX_VIDEO_MS } = {}) {
    if (!isVideoFile(file)) throw new Error('Expected a video');
    let working = file;
    try {
      const meta = await readVideoMeta(file);
      if (meta.durationMs > maxDurationMs) {
        const err = new Error('Trim this clip to 10 minutes or less before sharing.');
        err.code = 'VIDEO_TOO_LONG';
        throw err;
      }
    } catch (e) {
      if (e.code === 'VIDEO_TOO_LONG') throw e;
    }
    if (working.size > MAX_VIDEO_BYTES) {
      if (typeof onProgress === 'function') onProgress('File is large — compressing…', 2);
      working = await transcodeVideoFile(working, { maxBytes: MAX_VIDEO_BYTES, onProgress });
    }
    if (working.size > MAX_VIDEO_BYTES) {
      const err = new Error('This clip is still too large. Trim it or export at a lower quality, then retry.');
      err.code = 'VIDEO_TOO_HEAVY';
      throw err;
    }
    if (typeof onProgress === 'function') onProgress('Uploading video…', 8);
    const uploaded = await uploadToCloudinary(working, {
      resourceType: 'video',
      folder,
      filename: working.name || file.name || 'clip.mp4',
      onProgress,
    });
    const media = uploaded.secure_url;
    // Video "thumb": Cloudinary can serve a JPEG frame via so_0 + f_jpg
    const thumb = /\/upload\//.test(media)
      ? media.replace('/upload/', '/upload/so_0,w_480,c_limit,q_auto,f_jpg/').replace(/\.(mp4|webm|mov)(\?|$)/i, '.jpg$2')
      : null;

    return {
      media,
      thumb,
      mediaPath: uploaded.public_id || null,
      thumbPath: uploaded.public_id || null,
      width: uploaded.width || null,
      height: uploaded.height || null,
      previewUrl: URL.createObjectURL(file),
      mime: file.type,
      provider: 'cloudinary',
    };
  }

  function mediaUrlFor(item, context = 'list') {
    if (!item) return '';
    if (typeof item === 'string') return item;
    const full = item.media || item.url || item.src || '';
    const thumb = item.thumb || item.thumbnail || '';
    if (context === 'detail' || context === 'full') return full || thumb;
    if (context === 'avatar') return thumb || full;
    return thumb || full;
  }

  async function processAndUploadMedia(file, opts = {}) {
    if (!file) return null;
    if (isImageFile(file)) return uploadOptimizedImage(file, opts);
    if (isVideoFile(file)) return uploadVideoFile(file, opts);
    throw new Error('Unsupported media type');
  }

  window.IMAGE_PRESETS = PRESETS;
  window.transcodeVideoFile = transcodeVideoFile;
  window.readVideoMeta = readVideoMeta;
  window.compressImageFile = compressImageFile;
  window.uploadOptimizedImage = uploadOptimizedImage;
  window.uploadVideoFile = uploadVideoFile;
  window.uploadToCloudinary = uploadToCloudinary;
  window.processAndUploadMedia = processAndUploadMedia;
  window.mediaUrlFor = mediaUrlFor;
  window.isImageFile = isImageFile;
  window.isVideoFile = isVideoFile;
  window.getMediaConfig = getMediaConfig;
  window.isMediaUploadReady = isMediaUploadReady;
  window.cloudinaryTransformedUrl = cloudinaryTransformedUrl;
})();
