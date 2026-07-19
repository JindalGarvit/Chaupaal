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
  const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

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
      configPromise = fetch('/api/media-config')
        .then(async (r) => {
          const json = await r.json().catch(() => null);
          // Phase 5 envelope or legacy flat shape
          const data = json?.ok === true ? json.data : json;
          return { ok: r.ok, data };
        })
        .then(({ ok, data }) => {
          if (ok && data?.cloudName && data?.uploadPreset) {
            cachedConfig = {
              provider: 'cloudinary',
              cloudName: data.cloudName,
              uploadPreset: data.uploadPreset,
            };
          } else {
            cachedConfig = null;
          }
          return cachedConfig;
        })
        .catch(() => {
          cachedConfig = null;
          return null;
        });
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

  async function uploadToCloudinary(blobOrFile, { resourceType = 'image', folder = 'posts', filename } = {}) {
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
      throw new Error('Video is too large (max 15MB). Try a shorter clip.');
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`;
    const form = new FormData();
    form.append('file', blobOrFile, filename || (resourceType === 'video' ? 'clip.mp4' : 'photo.jpg'));
    form.append('upload_preset', cfg.uploadPreset);
    form.append('folder', folderPath(folder));
    // Public metadata only — helps audit in Cloudinary console
    if (currentUser?.uid) form.append('context', `uid=${currentUser.uid}`);

    const res = await fetch(endpoint, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
    }
    return data; // secure_url, public_id, width, height, …
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

  async function uploadVideoFile(file, { folder = 'videos', onProgress } = {}) {
    if (!isVideoFile(file)) throw new Error('Expected a video');
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('Video is too large (max 15MB). Try a shorter clip.');
    }
    if (typeof onProgress === 'function') onProgress('Uploading video…');
    const uploaded = await uploadToCloudinary(file, {
      resourceType: 'video',
      folder,
      filename: file.name || 'clip.mp4',
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
  window.compressImageFile = compressImageFile;
  window.uploadOptimizedImage = uploadOptimizedImage;
  window.uploadVideoFile = uploadVideoFile;
  window.processAndUploadMedia = processAndUploadMedia;
  window.mediaUrlFor = mediaUrlFor;
  window.isImageFile = isImageFile;
  window.isVideoFile = isVideoFile;
  window.getMediaConfig = getMediaConfig;
  window.isMediaUploadReady = isMediaUploadReady;
  window.cloudinaryTransformedUrl = cloudinaryTransformedUrl;
})();
