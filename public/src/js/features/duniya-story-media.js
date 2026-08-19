/**
 * Duniya story crop, filter, bake, and viewer transform helpers.
 */
(function () {
  'use strict';

  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const NS = (g.DuniyaStoryMedia = g.DuniyaStoryMedia || {});
  const W = 1080;
  const H = 1920;

  const FILTERS = {
    normal: 'none',
    bright: 'brightness(1.18) saturate(1.05)',
    contrast: 'contrast(1.25) saturate(1.1)',
    warm: 'sepia(0.25) saturate(1.15)',
    cool: 'hue-rotate(18deg) saturate(1.05)',
    mono: 'grayscale(1)',
    fade: 'contrast(0.92) brightness(1.08) saturate(0.75)',
  };

  const BAKE_TYPES = new Set(['text', 'draw', 'emoji', 'gif']);
  const KEEP_OVERLAY_TYPES = new Set([
    'poll',
    'question',
    'quiz',
    'slider',
    'countdown',
    'addyours',
    'link',
    'music',
    'location',
    'mention',
    'credit',
  ]);

  NS.filterCss = function filterCss(id) {
    return FILTERS[id] || FILTERS.normal;
  };

  NS.autoFitCrop916 = function autoFitCrop916(nw, nh) {
    const iw = Number(nw) || 1;
    const ih = Number(nh) || 1;
    const target = 9 / 16;
    const src = iw / ih;
    if (Math.abs(src - target) < 0.02) return { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
    const scale = src > target ? target / src : 1;
    return { x: 0.5, y: 0.5, scale: Math.max(1, 1 / scale), rotate: 0 };
  };

  NS.applyCropTransform = function applyCropTransform(el, item, stage) {
    if (!el || !item || !stage) return;
    const c = item.crop || { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
    const sw = stage.clientWidth || 1;
    const sh = stage.clientHeight || 1;
    const nw = el.naturalWidth || el.videoWidth || item.width || sw;
    const nh = el.naturalHeight || el.videoHeight || item.height || sh;
    const base = Math.max(sw / nw, sh / nh);
    const scale = base * (c.scale || 1);
    const dx = (0.5 - (c.x || 0.5)) * nw * scale;
    const dy = (0.5 - (c.y || 0.5)) * nh * scale;
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.width = nw + 'px';
    el.style.height = nh + 'px';
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    el.style.objectFit = 'cover';
    el.style.transformOrigin = 'center center';
    el.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${scale}) rotate(${c.rotate || item.rotation || 0}deg)`;
    el.style.filter = NS.filterCss(item.filter);
  };

  NS.bindCropGestures = function bindCropGestures(stage, el, item) {
    const pointers = new Map();
    let lastDist = 0;
    const pt = (e) => ({ x: e.clientX, y: e.clientY });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const paint = () => NS.applyCropTransform(el, item, stage);
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ds-crop-bar')) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, pt(e));
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const now = pt(e);
      pointers.set(e.pointerId, now);
      const pts = [...pointers.values()];
      if (pts.length === 2) {
        const d = dist(pts[0], pts[1]);
        if (lastDist) item.crop.scale = Math.max(1, Math.min(4, (item.crop.scale || 1) * (d / lastDist)));
        lastDist = d;
      } else {
        const sw = stage.clientWidth || 1;
        const sh = stage.clientHeight || 1;
        item.crop.x = Math.max(0, Math.min(1, (item.crop.x || 0.5) - (now.x - prev.x) / sw));
        item.crop.y = Math.max(0, Math.min(1, (item.crop.y || 0.5) - (now.y - prev.y) / sh));
      }
      paint();
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) lastDist = 0;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    paint();
  };

  NS.applyStoryMediaTransform = function applyStoryMediaTransform(stage, story) {
    if (!stage || !story) return;
    const el = stage.querySelector('img,video');
    if (!el) return;
    const item = {
      crop: story.crop || { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
      filter: story.filter || 'normal',
      rotation: story.rotation || 0,
      width: story.width,
      height: story.height,
    };
    if (item.rotation && !item.crop.rotate) item.crop.rotate = item.rotation;
    const paint = () => NS.applyCropTransform(el, item, stage);
    if (el.complete || el.readyState >= 2) paint();
    else el.addEventListener(el.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', paint, { once: true });
    stage.classList.remove(...Object.keys(FILTERS).map((k) => 'ds-filter-' + k));
    if (story.filter && story.filter !== 'normal' && !story.baked) {
      stage.classList.add('ds-filter-' + story.filter);
    }
  };

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function drawText(ctx, ov, w, h) {
    const x = (Number(ov.x) || 0.5) * w;
    const y = (Number(ov.y) || 0.5) * h;
    const scale = Number(ov.scale) || 1;
    const rot = ((Number(ov.rotate) || 0) * Math.PI) / 180;
    const size = Math.round(42 * scale);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.textAlign = ov.align || 'center';
    ctx.fillStyle = ov.color || '#fff';
    if (ov.bg) {
      ctx.font = `${ov.style === 'poster' ? '900' : ov.style === 'serif' ? '600' : '700'} ${size}px ${ov.style === 'serif' ? 'Georgia,serif' : 'Space Grotesk,sans-serif'}`;
      const m = ctx.measureText(ov.text || '');
      ctx.fillStyle = ov.bg;
      ctx.fillRect(-m.width / 2 - 12, -size, m.width + 24, size + 16);
      ctx.fillStyle = ov.color || '#fff';
    }
    ctx.font = `${ov.style === 'poster' ? '900' : ov.style === 'serif' ? '600' : '700'} ${size}px ${ov.style === 'serif' ? 'Georgia,serif' : 'Space Grotesk,sans-serif'}`;
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 4;
    ctx.fillText(ov.text || '', 0, 0);
    ctx.restore();
  }

  function drawStrokes(ctx, ov, w, h) {
    (ov.strokes || []).forEach((s) => {
      ctx.save();
      ctx.strokeStyle = s.eraser ? 'rgba(0,0,0,1)' : s.color || '#E63946';
      ctx.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over';
      ctx.lineWidth = s.width || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      (s.points || []).forEach((p, i) => {
        const px = (Number(p.x) || 0) * w;
        const py = (Number(p.y) || 0) * h;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawEmoji(ctx, ov, w, h) {
    const x = (Number(ov.x) || 0.5) * w;
    const y = (Number(ov.y) || 0.5) * h;
    const scale = Number(ov.scale) || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((Number(ov.rotate) || 0) * Math.PI) / 180);
    ctx.font = `${Math.round(72 * scale)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ov.emoji || '', 0, 0);
    ctx.restore();
  }

  async function drawGif(ctx, ov, w, h) {
    try {
      const img = await loadImage(ov.preview || ov.url);
      const x = (Number(ov.x) || 0.5) * w;
      const y = (Number(ov.y) || 0.5) * h;
      const scale = Number(ov.scale) || 1;
      const iw = Math.min(280, img.width) * scale;
      const ih = (img.height / img.width) * iw;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((Number(ov.rotate) || 0) * Math.PI) / 180);
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    } catch (e) {}
  }

  function drawImageCrop(ctx, img, item, w, h) {
    const c = item.crop || { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const base = Math.max(w / nw, h / nh);
    const scale = base * (c.scale || 1);
    const dx = (0.5 - (c.x || 0.5)) * nw * scale;
    const dy = (0.5 - (c.y || 0.5)) * nh * scale;
    ctx.save();
    ctx.filter = NS.filterCss(item.filter);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(((c.rotate || item.rotation || 0) * Math.PI) / 180);
    ctx.drawImage(img, -nw * scale / 2 + dx, -nh * scale / 2 + dy, nw * scale, nh * scale);
    ctx.restore();
  }

  NS.splitOverlaysForBake = function splitOverlaysForBake(overlays) {
    const list = Array.isArray(overlays) ? overlays : [];
    const bakedOverlays = [];
    const payloadOverlays = [];
    list.forEach((ov) => {
      if (BAKE_TYPES.has(ov.type)) bakedOverlays.push(ov);
      else if (KEEP_OVERLAY_TYPES.has(ov.type)) payloadOverlays.push(ov);
      else payloadOverlays.push(ov);
    });
    return { bakedOverlays, payloadOverlays };
  };

  NS.renderDrawOverlayHtml = function renderDrawOverlayHtml(ov, opts) {
    if (!ov?.strokes?.length) return '';
    const w = opts?.width || 360;
    const h = opts?.height || 640;
    const paths = (ov.strokes || [])
      .map((s) => {
        const points = s.points || [];
        if (points.length < 2) return '';
        const d = points
          .map((p, i) => {
            const px = (Number(p.x) || 0) * w;
            const py = (Number(p.y) || 0) * h;
            return `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
          })
          .join(' ');
        return `<path d="${d}" fill="none" stroke="${s.eraser ? 'transparent' : s.color || '#E63946'}" stroke-width="${s.width || 4}" stroke-linecap="round" stroke-linejoin="round"${s.eraser ? ' opacity="0"' : ''}/>`;
      })
      .join('');
    const style =
      typeof DuniyaStory !== 'undefined' && DuniyaStory.overlayStyle ? DuniyaStory.overlayStyle(ov) : 'left:0;top:0;width:100%;height:100%;transform:none;';
    return `<svg class="ds-ov ds-ov-draw" data-ov="${String(ov.id || '').replace(/"/g, '&quot;')}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="${style}pointer-events:none;">${paths}</svg>`;
  };

  NS.bakeStoryImage = async function bakeStoryImage(item, { width = W, height = H } = {}) {
    if (!item?.url || item.mediaType === 'video') return null;
    const img = await loadImage(item.url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawImageCrop(ctx, img, item, width, height);
    const { bakedOverlays } = NS.splitOverlaysForBake(item.overlays || []);
    for (const ov of bakedOverlays) {
      if (ov.type === 'text') drawText(ctx, ov, width, height);
      else if (ov.type === 'draw') drawStrokes(ctx, ov, width, height);
      else if (ov.type === 'emoji') drawEmoji(ctx, ov, width, height);
      else if (ov.type === 'gif') await drawGif(ctx, ov, width, height);
    }
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      filterCss: NS.filterCss,
      autoFitCrop916: NS.autoFitCrop916,
      splitOverlaysForBake: NS.splitOverlaysForBake,
      renderDrawOverlayHtml: NS.renderDrawOverlayHtml,
      bakeStoryImage: NS.bakeStoryImage,
      applyStoryMediaTransform: NS.applyStoryMediaTransform,
      BAKE_TYPES,
      KEEP_OVERLAY_TYPES,
      FILTERS,
    };
  }
})();
