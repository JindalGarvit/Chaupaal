/**
 * Duniya story canvas editor — crop/trim → overlays → hybrid bake → Share.
 */
(function () {
  'use strict';
  const NS = (window.DuniyaStory = window.DuniyaStory || {});
  const M = () => window.DuniyaStoryMedia || {};
  const MAX_VIDEO_MS = 90 * 1000;
  const FILTERS = ['normal', 'bright', 'contrast', 'warm', 'cool', 'mono', 'fade'];
  const BRUSHES = {
    pen: { width: 4, alpha: 1 },
    marker: { width: 12, alpha: 0.55 },
    neon: { width: 6, alpha: 1, glow: true },
    eraser: { width: 18, eraser: true },
  };

  function uid() {
    return typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function newItem(file, extra) {
    const mediaType = file?.type?.startsWith('video') ? 'video' : 'image';
    return {
      id: uid(),
      file,
      url: file ? URL.createObjectURL(file) : extra?.url || '',
      mediaType,
      durationMs: 0,
      trimStartMs: 0,
      trimEndMs: 0,
      muted: false,
      rotation: 0,
      crop: { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
      filter: 'normal',
      overlays: extra?.overlays ? extra.overlays.slice() : [],
      music: extra?.music || null,
      location: extra?.location || null,
      mentions: extra?.mentions || [],
      interactive: extra?.interactive || null,
      text: '',
      parentStoryId: extra?.parentStoryId || '',
      chainId: extra?.chainId || '',
      restoryOf: extra?.restoryOf || null,
      _cropInit: false,
    };
  }

  function bindDrag(el, ov, stage) {
    let sx = 0;
    let sy = 0;
    let ox = ov.x;
    let oy = ov.y;
    let dist0 = 0;
    let scale0 = ov.scale || 1;
    let rot0 = ov.rotate || 0;
    let ang0 = 0;
    const pointers = new Map();

    const onDown = (e) => {
      if (ov.locked) return;
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        sx = e.clientX;
        sy = e.clientY;
        ox = ov.x;
        oy = ov.y;
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()];
        dist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        scale0 = ov.scale || 1;
        rot0 = ov.rotate || 0;
        ang0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      }
      e.stopPropagation();
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const host = stage?.getBoundingClientRect();
      if (!host) return;
      if (pointers.size >= 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        if (dist0) ov.scale = Math.max(0.4, Math.min(3, scale0 * (dist / dist0)));
        ov.rotate = rot0 + ((ang - ang0) * 180) / Math.PI;
      } else {
        ov.x = Math.max(0.05, Math.min(0.95, ox + (e.clientX - sx) / host.width));
        ov.y = Math.max(0.05, Math.min(0.95, oy + (e.clientY - sy) / host.height));
      }
      el.style.left = ov.x * 100 + '%';
      el.style.top = ov.y * 100 + '%';
      el.style.transform = `translate(-50%,-50%) scale(${ov.scale || 1}) rotate(${ov.rotate || 0}deg)`;
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  NS.openEditor = function openEditor(opts) {
    const files = opts?.files || [];
    if (!files.length && !opts?.restoryOf) return;
    const queue = files.map((f) =>
      newItem(f, {
        parentStoryId: opts.parentStory?.id || opts.parentStoryId,
        chainId: opts.parentStory?.chainId || opts.parentStory?.id || opts.chainId,
        restoryOf: opts.restoryOf || null,
        overlays: opts.overlays,
      })
    );
    if (opts?.restoryOf && opts?.mediaUrl && !files.length) {
      queue.push(
        newItem(null, {
          restoryOf: opts.restoryOf,
          overlays: [{ type: 'credit', uid: opts.restoryOf.uid, name: opts.restoryOf.name, x: 0.5, y: 0.9, locked: true, z: 20 }],
        })
      );
      queue[0].url = opts.mediaUrl;
      queue[0].mediaType = opts.mediaType || 'image';
    }
    if (opts?.parentStory && opts.parentStory.overlays?.some((o) => o.type === 'addyours')) {
      const src = opts.parentStory.overlays.find((o) => o.type === 'addyours');
      queue[0].overlays.push({ ...src, id: uid(), x: 0.5, y: 0.78 });
      queue[0].parentStoryId = opts.parentStory.id;
      queue[0].chainId = opts.parentStory.chainId || opts.parentStory.id;
    }
    let idx = 0;
    let dirty = true;
    let drawing = false;
    let cropMode = false;
    let showFilters = false;
    let drawColor = '#E63946';
    let drawBrush = 'pen';
    let drawSize = 4;
    let drawUndo = [];
    let activeTextId = null;

    const strokes = () => {
      let ov = queue[idx].overlays.find((o) => o.type === 'draw');
      if (!ov) {
        ov = { id: uid(), type: 'draw', x: 0.5, y: 0.5, scale: 1, rotate: 0, z: 2, strokes: [] };
        queue[idx].overlays.push(ov);
      }
      return ov;
    };

    const root = document.createElement('div');
    root.className = 'ds-overlay ds-editor';
    root.dataset.navManaged = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', NS.tt('duniya_story_editor', 'Edit story'));
    const device = document.querySelector('.device') || document.body;
    device.appendChild(root);

    const closeLayer = () => {
      try {
        if (typeof pauseAllMusic === 'function') pauseAllMusic();
      } catch (e) {}
      queue.forEach((it) => {
        try {
          if (it.url && it.url.startsWith('blob:')) URL.revokeObjectURL(it.url);
        } catch (e) {}
      });
      root.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('duniya_story_editor');
      } catch (e) {}
    };

    let layer = { close: closeLayer };
    if (typeof openLayer === 'function') layer = openLayer(root, closeLayer, { host: device, remove: true, label: 'Story editor' });

    function confirmClose() {
      if (dirty && !window.confirm(NS.tt('duniya_story_discard', 'Discard this story?'))) return;
      layer.close();
    }

    function paintMediaTransform(stage, item) {
      const el = stage.querySelector('img,video');
      if (!el || item.mediaType !== 'image') return;
      const media = M();
      if (!media.applyCropTransform) return;
      const apply = () => {
        if (!item._cropInit && el.naturalWidth) {
          item._cropInit = true;
          if (item.crop.scale === 1 && item.crop.x === 0.5 && item.crop.y === 0.5 && media.autoFitCrop916) {
            Object.assign(item.crop, media.autoFitCrop916(el.naturalWidth, el.naturalHeight));
          }
        }
        if (cropMode && media.bindCropGestures) {
          if (!stage.dataset.cropBound) {
            stage.dataset.cropBound = '1';
            media.bindCropGestures(stage, el, item);
          }
        } else {
          delete stage.dataset.cropBound;
          media.applyCropTransform(el, item, stage);
        }
      };
      if (el.complete && el.naturalWidth) apply();
      else el.addEventListener('load', apply, { once: true });
    }

    function paintOverlays(stage) {
      stage.querySelectorAll('.ds-ov,.ds-draw-canvas,.ds-inline-text').forEach((n) => n.remove());
      NS.renderOverlaysInto(stage, queue[idx], {
        width: stage.clientWidth || 360,
        height: stage.clientHeight || 640,
      });
      stage.querySelectorAll('.ds-ov').forEach((el) => {
        const ov = queue[idx].overlays.find((o) => o.id === el.dataset.ov);
        if (ov && ov.type !== 'draw') bindDrag(el, ov, stage);
      });
      const drawOv = queue[idx].overlays.find((o) => o.type === 'draw');
      if (drawOv || drawing) {
        const canvas = document.createElement('canvas');
        canvas.className = 'ds-draw-canvas';
        canvas.width = stage.clientWidth || 360;
        canvas.height = stage.clientHeight || 640;
        stage.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const replay = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          (drawOv?.strokes || []).forEach((s) => {
            ctx.save();
            ctx.strokeStyle = s.eraser ? 'rgba(0,0,0,1)' : s.color;
            ctx.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over';
            ctx.lineWidth = s.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (s.glow) {
              ctx.shadowColor = s.color;
              ctx.shadowBlur = 12;
            }
            ctx.globalAlpha = s.alpha != null ? s.alpha : 1;
            ctx.beginPath();
            s.points.forEach((p, i) => {
              const x = p.x * canvas.width;
              const y = p.y * canvas.height;
              if (i) ctx.lineTo(x, y);
              else ctx.moveTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
          });
          ctx.globalCompositeOperation = 'source-over';
        };
        replay();
        if (drawing) {
          let cur = null;
          const pt = (e) => {
            const r = canvas.getBoundingClientRect();
            const p = e.touches ? e.touches[0] : e;
            return { x: (p.clientX - r.left) / r.width, y: (p.clientY - r.top) / r.height };
          };
          const brush = BRUSHES[drawBrush] || BRUSHES.pen;
          canvas.addEventListener('pointerdown', (e) => {
            cur = {
              color: drawColor,
              width: drawBrush === 'eraser' ? brush.width : drawSize || brush.width,
              eraser: drawBrush === 'eraser',
              alpha: brush.alpha,
              glow: brush.glow,
              points: [pt(e)],
            };
            e.preventDefault();
          });
          canvas.addEventListener('pointermove', (e) => {
            if (!cur) return;
            cur.points.push(pt(e));
            replay();
            ctx.save();
            ctx.strokeStyle = cur.eraser ? 'rgba(0,0,0,1)' : cur.color;
            ctx.globalCompositeOperation = cur.eraser ? 'destination-out' : 'source-over';
            ctx.lineWidth = cur.width;
            ctx.lineCap = 'round';
            if (cur.glow) {
              ctx.shadowColor = cur.color;
              ctx.shadowBlur = 12;
            }
            ctx.globalAlpha = cur.alpha != null ? cur.alpha : 1;
            ctx.beginPath();
            cur.points.forEach((p, i) => {
              const x = p.x * canvas.width;
              const y = p.y * canvas.height;
              if (i) ctx.lineTo(x, y);
              else ctx.moveTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
          });
          canvas.addEventListener('pointerup', () => {
            if (cur && cur.points.length > 1) {
              const ov = strokes();
              drawUndo.push(JSON.stringify(ov.strokes || []));
              ov.strokes = (ov.strokes || []).concat([cur]);
            }
            cur = null;
            replay();
          });
        }
      }
    }

    function bindTrimScrubber(stage, item) {
      const track = root.querySelector('[data-trim-track]');
      const range = root.querySelector('[data-trim-range]');
      const hL = root.querySelector('[data-h-l]');
      const hR = root.querySelector('[data-h-r]');
      const label = root.querySelector('[data-trim-label]');
      const v = stage.querySelector('video');
      if (!track || !v) return;
      const dur = () => item.durationMs || MAX_VIDEO_MS;
      const paint = () => {
        const d = dur();
        const l = (item.trimStartMs / d) * 100;
        const r = (item.trimEndMs / d) * 100;
        if (range) {
          range.style.left = l + '%';
          range.style.width = Math.max(0, r - l) + '%';
        }
        if (hL) hL.style.left = l + '%';
        if (hR) hR.style.left = r + '%';
        if (label) {
          const span = Math.round((item.trimEndMs - item.trimStartMs) / 100) / 10;
          label.textContent = d > MAX_VIDEO_MS ? `${NS.tt('story_trim_needed', 'Trim to 90s or less')} · ${span}s` : `${span}s selected`;
        }
        try {
          v.currentTime = (item.trimStartMs || 0) / 1000;
        } catch (e) {}
      };
      const drag = (handle, which) => {
        let moving = false;
        handle.addEventListener('pointerdown', (e) => {
          moving = true;
          handle.setPointerCapture(e.pointerId);
          e.stopPropagation();
        });
        handle.addEventListener('pointermove', (e) => {
          if (!moving) return;
          const rect = track.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const d = dur();
          if (which === 'start') item.trimStartMs = Math.round(pct * d);
          else item.trimEndMs = Math.round(pct * d);
          if (item.trimEndMs - item.trimStartMs > MAX_VIDEO_MS) {
            if (which === 'start') item.trimStartMs = item.trimEndMs - MAX_VIDEO_MS;
            else item.trimEndMs = item.trimStartMs + MAX_VIDEO_MS;
          }
          if (item.trimEndMs <= item.trimStartMs) item.trimEndMs = Math.min(d, item.trimStartMs + 1000);
          paint();
        });
        const up = () => {
          moving = false;
        };
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      };
      drag(hL, 'start');
      drag(hR, 'end');
      v.addEventListener('timeupdate', () => {
        const end = item.trimEndMs / 1000;
        if (v.currentTime >= end) {
          v.currentTime = (item.trimStartMs || 0) / 1000;
          v.play().catch(() => {});
        }
      });
      paint();
    }

    function addInlineText() {
      const item = queue[idx];
      const id = uid();
      const ov = { id, type: 'text', text: NS.tt('story_tap_edit', 'Tap to edit'), x: 0.5, y: 0.4, scale: 1, rotate: 0, z: 6, color: '#fff', style: 'display', align: 'center' };
      item.overlays.push(ov);
      activeTextId = id;
      render();
    }

    function render() {
      const item = queue[idx];
      const media =
        item.mediaType === 'video'
          ? `<video src="${NS.esc(item.url)}" playsinline loop ${item.muted ? 'muted' : ''}></video>`
          : `<img src="${NS.esc(item.url)}" alt="" crossorigin="anonymous">`;
      const filterBar = showFilters
        ? `<div class="ds-filter-carousel" data-filters>${FILTERS.map(
            (f) =>
              `<button type="button" class="ds-filter-chip${item.filter === f ? ' is-on' : ''}" data-f="${f}"><span class="ds-filter-thumb ds-filter-${f}"></span><small>${f}</small></button>`
          ).join('')}</div>`
        : '';
      const drawBar = drawing
        ? `<div class="ds-draw-bar">
            ${Object.keys(BRUSHES)
              .map((b) => `<button type="button" class="${drawBrush === b ? 'is-on' : ''}" data-brush="${b}">${b}</button>`)
              .join('')}
            <input type="range" min="2" max="24" value="${drawSize}" data-size aria-label="Size">
            <input type="color" value="${drawColor}" data-color aria-label="Color">
            <button type="button" data-undo aria-label="Undo">↶</button>
            <button type="button" data-redo aria-label="Redo">↷</button>
            <button type="button" data-draw-done>${NS.tt('done', 'Done')}</button>
          </div>`
        : '';
      const cropBar = cropMode
        ? `<div class="ds-crop-bar"><button type="button" data-crop-cancel>${NS.tt('cancel', 'Cancel')}</button><span>${NS.tt('story_crop', 'Crop')}</span><button type="button" data-crop-done>${NS.tt('done', 'Done')}</button></div>`
        : '';
      root.innerHTML = `
        <div class="ds-stage${NS.filterClass(item.filter)}${cropMode ? ' is-crop' : ''}" data-stage>${media}</div>
        ${cropBar}
        ${item.mediaType === 'video' ? `<div class="ds-trim-scrub" data-trim><div class="ds-trim-track" data-trim-track><div class="ds-trim-range" data-trim-range></div></div><div class="ds-trim-handle ds-trim-l" data-h-l></div><div class="ds-trim-handle ds-trim-r" data-h-r></div><small data-trim-label></small></div>` : ''}
        <div class="ds-topbar">
          <button type="button" class="ds-icon-btn" data-close aria-label="Close">✕</button>
          <div class="ds-topbar-actions">
            <button type="button" class="ds-icon-btn" data-save aria-label="Save">${NS.tt('story_save', 'Save')}</button>
            <button type="button" class="ds-cta" data-share>${NS.tt('story_share', 'Share')}</button>
          </div>
        </div>
        ${!cropMode && !drawing ? `<div class="ds-toolbar">
          <button type="button" data-tool="text"><span>Aa</span><small>Text</small></button>
          <button type="button" data-tool="stickers"><span>☺</span><small>Stickers</small></button>
          <button type="button" data-tool="draw"><span>✎</span><small>Draw</small></button>
          <button type="button" data-tool="music"><span>♪</span><small>Music</small></button>
          <button type="button" data-tool="effects"><span>✦</span><small>Effects</small></button>
          <button type="button" data-tool="more"><span>⋯</span><small>More</small></button>
        </div>` : ''}
        ${filterBar}${drawBar}
        <div class="ds-bottombar">
          <div class="ds-filmstrip" data-strip></div>
        </div>`;
      const stage = root.querySelector('[data-stage]');
      paintMediaTransform(stage, item);
      if (item.mediaType === 'video') {
        const v = stage.querySelector('video');
        v.addEventListener('loadedmetadata', () => {
          item.durationMs = Math.round((v.duration || 0) * 1000);
          if (!item.trimEndMs) item.trimEndMs = Math.min(item.durationMs, MAX_VIDEO_MS);
          bindTrimScrubber(stage, item);
        });
        v.play().catch(() => {});
        if (item.durationMs) bindTrimScrubber(stage, item);
      }
      paintOverlays(stage);
      if (activeTextId) {
        const ov = queue[idx].overlays.find((o) => o.id === activeTextId);
        if (ov && ov.type === 'text') {
          const el = stage.querySelector(`[data-ov="${ov.id}"]`);
          if (el) {
            el.contentEditable = 'true';
            el.focus();
            el.addEventListener('input', () => {
              ov.text = el.textContent.trim() || ov.text;
            });
            el.addEventListener('blur', () => {
              ov.text = el.textContent.trim() || NS.tt('story_tap_edit', 'Tap to edit');
              activeTextId = null;
            });
          }
        }
      }
      const strip = root.querySelector('[data-strip]');
      if (queue.length > 1) {
        strip.innerHTML = queue
          .map(
            (it, i) =>
              `<button type="button" class="ds-film${i === idx ? ' is-on' : ''}" data-i="${i}">${
                it.mediaType === 'video' ? `<video src="${NS.esc(it.url)}" muted></video>` : `<img src="${NS.esc(it.url)}" alt="">`
              }</button>`
          )
          .join('');
        strip.querySelectorAll('[data-i]').forEach((b) =>
          b.addEventListener('click', () => {
            idx = Number(b.dataset.i);
            cropMode = false;
            drawing = false;
            showFilters = false;
            render();
          })
        );
      } else {
        strip.innerHTML = '';
      }
      root.querySelector('[data-close]').addEventListener('click', confirmClose);
      root.querySelector('[data-save]').addEventListener('click', () => share({ saveOnly: true }));
      root.querySelector('[data-share]').addEventListener('click', () => share({}));
      root.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => runTool(b.dataset.tool)));
      root.querySelectorAll('[data-f]').forEach((b) =>
        b.addEventListener('click', () => {
          item.filter = b.dataset.f;
          render();
        })
      );
      root.querySelector('[data-draw-done]')?.addEventListener('click', () => {
        drawing = false;
        render();
      });
      root.querySelectorAll('[data-brush]').forEach((b) =>
        b.addEventListener('click', () => {
          drawBrush = b.dataset.brush;
          render();
        })
      );
      root.querySelector('[data-size]')?.addEventListener('input', (e) => {
        drawSize = Number(e.target.value) || 4;
      });
      root.querySelector('[data-color]')?.addEventListener('input', (e) => {
        drawColor = e.target.value;
      });
      root.querySelector('[data-undo]')?.addEventListener('click', () => {
        const ov = strokes();
        if (ov.strokes?.length) {
          drawUndo.push(JSON.stringify(ov.strokes));
          ov.strokes.pop();
          render();
        }
      });
      root.querySelector('[data-redo]')?.addEventListener('click', () => {
        if (!drawUndo.length) return;
        try {
          strokes().strokes = JSON.parse(drawUndo.pop());
          render();
        } catch (e) {}
      });
      root.querySelector('[data-crop-done]')?.addEventListener('click', () => {
        cropMode = false;
        render();
      });
      root.querySelector('[data-crop-cancel]')?.addEventListener('click', () => {
        cropMode = false;
        render();
      });
    }

    function promptSheet(title, bodyHtml, onMount) {
      const sheet = document.createElement('div');
      sheet.className = 'ds-sheet';
      sheet.innerHTML = `<h3>${NS.esc(title)}</h3>${bodyHtml}<button type="button" class="ds-cta" data-done style="margin-top:10px;">${NS.tt('done', 'Done')}</button>`;
      root.appendChild(sheet);
      const done = () => sheet.remove();
      sheet.querySelector('[data-done]')?.addEventListener('click', done);
      onMount?.(sheet, done);
    }

    function runTool(tool) {
      const item = queue[idx];
      if (tool === 'text') {
        addInlineText();
      } else if (tool === 'draw') {
        drawing = true;
        showFilters = false;
        render();
      } else if (tool === 'stickers') {
        promptSheet(
          NS.tt('story_stickers', 'Stickers'),
          `<div data-emoji class="ds-emoji-grid">${['🔥', '✨', '❤️', '😂', '🙏', '☕', '🏏', '🎵', '🌟', '🏠'].map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div><button type="button" class="btn" data-gif>GIF</button>`,
          (sheet, done) => {
            sheet.querySelectorAll('[data-e]').forEach((b) =>
              b.addEventListener('click', () => {
                item.overlays.push({ id: uid(), type: 'emoji', emoji: b.dataset.e, x: 0.5, y: 0.45, scale: 1, rotate: 0, z: 7 });
                done();
                render();
              })
            );
            sheet.querySelector('[data-gif]')?.addEventListener('click', () => {
              done();
              if (typeof openGifPicker === 'function') {
                openGifPicker({
                  onSelect: (gif) => {
                    item.overlays.push({
                      id: uid(),
                      type: 'gif',
                      url: gif.url,
                      preview: gif.preview || gif.url,
                      x: 0.5,
                      y: 0.5,
                      scale: 1,
                      rotate: 0,
                      z: 7,
                    });
                    render();
                  },
                });
              }
            });
          }
        );
      } else if (tool === 'music') {
        const picker = typeof openSongPicker === 'function' ? openSongPicker : typeof openMusicPicker === 'function' ? openMusicPicker : null;
        picker?.({
          onSelect: (song) => {
            item.music = song;
            if (!item.overlays.some((o) => o.type === 'music')) {
              item.overlays.push({ id: uid(), type: 'music', x: 0.5, y: 0.84, scale: 1, rotate: 0, z: 8 });
            }
            render();
          },
        });
      } else if (tool === 'effects') {
        showFilters = !showFilters;
        drawing = false;
        render();
      } else if (tool === 'more') {
        promptSheet(
          NS.tt('more', 'More'),
          `
          <button type="button" class="ds-sheet-btn" data-m="mention">@${NS.tt('mention', 'Mention')}</button>
          <button type="button" class="ds-sheet-btn" data-m="location">📍 ${NS.tt('location', 'Location')}</button>
          <button type="button" class="ds-sheet-btn" data-m="interactive">◍ ${NS.tt('story_interactive', 'Interactive')}</button>
          <button type="button" class="ds-sheet-btn" data-m="crop">⛶ ${NS.tt('story_crop', 'Crop')}</button>
          <button type="button" class="ds-sheet-btn" data-m="camera">📷 ${NS.tt('camera', 'Camera')}</button>`,
          (sheet, done) => {
            sheet.querySelectorAll('[data-m]').forEach((b) =>
              b.addEventListener('click', () => {
                const m = b.dataset.m;
                done();
                if (m === 'mention') runMention();
                else if (m === 'location') runLocation();
                else if (m === 'interactive') runInteractiveMenu();
                else if (m === 'crop') {
                  cropMode = true;
                  showFilters = false;
                  drawing = false;
                  render();
                } else if (m === 'camera') {
                  NS.pickGallery({
                    capture: true,
                    onFile: (file) => {
                      queue.push(newItem(file));
                      idx = queue.length - 1;
                      render();
                    },
                  });
                }
              })
            );
          }
        );
      }
    }

    function runMention() {
      const item = queue[idx];
      promptSheet(NS.tt('story_mention', 'Mention'), `<input type="search" data-q placeholder="@username">`, (sheet) => {
        const q = sheet.querySelector('[data-q]');
        const run = async () => {
          if (typeof searchUsersProvider !== 'function') return;
          const rows = await searchUsersProvider(q.value.trim(), { limit: 6 }).catch(() => []);
          sheet.querySelectorAll('[data-uid]').forEach((n) => n.remove());
          (rows || []).forEach((u) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ds-row';
            b.dataset.uid = u.uid;
            b.innerHTML = `${u.photoURL ? `<img src="${NS.esc(u.photoURL)}" alt="">` : ''}<span>${NS.esc(u.name || u.username)}</span>`;
            b.addEventListener('click', async () => {
              let blocked = false;
              try {
                if (typeof getBlockedSet === 'function') blocked = getBlockedSet().has(u.uid);
              } catch (e) {}
              if (blocked) {
                if (typeof showToast === 'function') showToast(NS.tt('story_blocked', 'You can’t mention this person'));
                return;
              }
              item.overlays.push({
                id: uid(),
                type: 'mention',
                uid: u.uid,
                name: u.name,
                username: u.username,
                x: 0.5,
                y: 0.3,
                scale: 1,
                rotate: 0,
                z: 7,
              });
              item.mentions.push({ uid: u.uid, name: u.name, username: u.username, x: 0.5, y: 0.3 });
              sheet.remove();
              render();
            });
            sheet.appendChild(b);
          });
        };
        q.addEventListener('input', () => {
          clearTimeout(q._t);
          q._t = setTimeout(run, 200);
        });
      });
    }

    function runLocation() {
      const item = queue[idx];
      if (typeof openLocationComposer !== 'function') return;
      openLocationComposer({
        onSelect: (loc) => {
          item.location = loc;
          if (!item.overlays.some((o) => o.type === 'location')) {
            item.overlays.push({ id: uid(), type: 'location', x: 0.5, y: 0.16, scale: 1, rotate: 0, z: 8 });
          }
          render();
        },
      });
    }

    function runInteractiveMenu() {
      promptSheet(
        NS.tt('story_interactive', 'Stickers'),
        `
          <button type="button" data-k="poll">Poll</button>
          <button type="button" data-k="question">Question</button>
          <button type="button" data-k="quiz">Quiz</button>
          <button type="button" data-k="slider">Slider</button>
          <button type="button" data-k="countdown">Countdown</button>
          <button type="button" data-k="addyours">Add yours</button>
          <button type="button" data-k="link">Link</button>
        `,
        (sheet, done) => {
          sheet.querySelectorAll('[data-k]').forEach((b) =>
            b.addEventListener('click', () => {
              done();
              addInteractive(b.dataset.k);
            })
          );
        }
      );
    }

    function addInteractive(kind) {
      const item = queue[idx];
      if (kind === 'poll') {
        promptSheet('Poll', `<input data-p placeholder="Question" maxlength="80"><input data-a placeholder="Option 1"><input data-b placeholder="Option 2"><input data-c placeholder="Option 3 (optional)">`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            const options = [sheet.querySelector('[data-a]').value, sheet.querySelector('[data-b]').value, sheet.querySelector('[data-c]').value].map((x) => x.trim()).filter(Boolean);
            if (options.length >= 2) {
              item.overlays.push({ id: uid(), type: 'poll', prompt: sheet.querySelector('[data-p]').value.trim() || 'Vote', options, x: 0.5, y: 0.55, scale: 1, rotate: 0, z: 9 });
            }
            done();
            render();
          });
        });
      } else if (kind === 'question') {
        promptSheet('Question', `<input data-p placeholder="Ask something" maxlength="100">`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            item.overlays.push({ id: uid(), type: 'question', prompt: sheet.querySelector('[data-p]').value.trim() || 'Ask me', x: 0.5, y: 0.5, scale: 1, rotate: 0, z: 9 });
            done();
            render();
          });
        });
      } else if (kind === 'quiz') {
        promptSheet('Quiz', `<input data-p placeholder="Prompt"><input data-a placeholder="Correct answer"><input data-b placeholder="Wrong 1"><input data-c placeholder="Wrong 2">`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            const options = [sheet.querySelector('[data-a]').value, sheet.querySelector('[data-b]').value, sheet.querySelector('[data-c]').value].map((x) => x.trim()).filter(Boolean);
            if (options.length >= 2) {
              item.overlays.push({ id: uid(), type: 'quiz', prompt: sheet.querySelector('[data-p]').value.trim() || 'Quiz', options, correctIndex: 0, x: 0.5, y: 0.55, scale: 1, rotate: 0, z: 9 });
            }
            done();
            render();
          });
        });
      } else if (kind === 'slider') {
        promptSheet('Slider', `<input data-p placeholder="How spicy?" maxlength="80"><input data-e value="🔥" maxlength="4">`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            item.overlays.push({ id: uid(), type: 'slider', prompt: sheet.querySelector('[data-p]').value.trim() || 'Slide', emoji: sheet.querySelector('[data-e]').value || '🔥', x: 0.5, y: 0.6, scale: 1, rotate: 0, z: 9 });
            done();
            render();
          });
        });
      } else if (kind === 'countdown') {
        promptSheet('Countdown', `<input data-t placeholder="Title"><input type="datetime-local" data-d>`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            const at = new Date(sheet.querySelector('[data-d]').value).getTime();
            if (at) {
              item.overlays.push({ id: uid(), type: 'countdown', title: sheet.querySelector('[data-t]').value.trim() || 'Countdown', targetAt: at, x: 0.5, y: 0.45, scale: 1, rotate: 0, z: 9 });
            }
            done();
            render();
          });
        });
      } else if (kind === 'addyours') {
        promptSheet('Add yours', `<input data-p placeholder="Prompt" maxlength="80">`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            item.overlays.push({ id: uid(), type: 'addyours', prompt: sheet.querySelector('[data-p]').value.trim() || 'Add yours', x: 0.5, y: 0.72, scale: 1, rotate: 0, z: 9 });
            done();
            render();
          });
        });
      } else if (kind === 'link') {
        const professional =
          (typeof ownProfileType === 'function' ? ownProfileType() : typeof userProfile !== 'undefined' ? userProfile.profileType : '') === 'professional';
        promptSheet('Link', `<input data-u placeholder="https://"><small>${professional ? '' : NS.tt('story_link_confirm', 'This will be tappable on your story.')}</small>`, (sheet, done) => {
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            const url = String(sheet.querySelector('[data-u]').value || '').trim();
            if (!/^https:\/\//i.test(url) || /javascript:/i.test(url)) {
              if (typeof showToast === 'function') showToast(NS.tt('story_link_https', 'Use an https link'));
              return;
            }
            if (!professional && !window.confirm(NS.tt('story_link_confirm', 'This will be tappable on your story.'))) return;
            item.overlays.push({ id: uid(), type: 'link', url, label: url.replace(/^https:\/\//i, '').slice(0, 32), x: 0.5, y: 0.7, scale: 1, rotate: 0, z: 9 });
            done();
            render();
          });
        });
      }
    }

    async function share({ saveOnly } = {}) {
      const shareBtn = root.querySelector('[data-share]');
      if (shareBtn) shareBtn.disabled = true;
      for (const item of queue) {
        if (item.mediaType === 'video') {
          const span = (item.trimEndMs || 0) - (item.trimStartMs || 0);
          const dur = item.durationMs || 0;
          if (dur > MAX_VIDEO_MS && span > MAX_VIDEO_MS) {
            if (typeof showToast === 'function') showToast(NS.tt('story_trim_needed', 'Trim video to 90 seconds'));
            if (shareBtn) shareBtn.disabled = false;
            idx = queue.indexOf(item);
            render();
            return;
          }
        }
        try {
          let media = item.url;
          let thumb = item.url;
          let overlays = item.overlays;
          let baked = false;
          let filter = item.filter;
          const mediaApi = M();

          if (item.mediaType === 'image' && mediaApi.bakeStoryImage && mediaApi.splitOverlaysForBake) {
            const blob = await mediaApi.bakeStoryImage(item);
            if (blob && typeof processAndUploadMedia === 'function') {
              const file = new File([blob], `story-${uid()}.jpg`, { type: 'image/jpeg' });
              const up = await processAndUploadMedia(file, { folder: 'stories' });
              media = up.media || up.url || up.secure_url;
              thumb = up.thumb || media;
              overlays = mediaApi.splitOverlaysForBake(item.overlays).payloadOverlays;
              baked = true;
              filter = 'normal';
            }
          } else if (item.file && typeof processAndUploadMedia === 'function') {
            const up = await processAndUploadMedia(item.file, { folder: 'stories' });
            media = up.media || up.url || up.secure_url;
            thumb = up.thumb || media;
          }

          if (!media && !item.text && !item.music && !item.location) throw new Error('EMPTY_STORY');
          await createPlatformStory({
            destination: 'duniya',
            kind: 'story',
            type: 'media',
            media,
            thumb,
            mediaType: item.mediaType,
            durationMs:
              item.mediaType === 'video'
                ? Math.min(MAX_VIDEO_MS, (item.trimEndMs || item.durationMs) - (item.trimStartMs || 0) || item.durationMs)
                : 6000,
            overlays,
            interactive: item.interactive,
            mentions: item.mentions,
            music: item.music,
            location: item.location,
            filter,
            baked,
            crop: baked ? null : item.crop,
            rotation: baked ? 0 : item.rotation,
            trimStartMs: item.trimStartMs,
            trimEndMs: item.trimEndMs,
            muted: item.muted,
            parentStoryId: item.parentStoryId,
            chainId: item.chainId,
            restoryOf: item.restoryOf,
            saveOnly: !!saveOnly,
            clientId: uid() + uid(),
          });
        } catch (err) {
          NS.report('duniya_story_share', err);
          if (shareBtn) shareBtn.disabled = false;
          const retry = document.createElement('button');
          retry.className = 'ds-retry';
          retry.type = 'button';
          retry.textContent = NS.tt('story_retry', 'Couldn’t share — Retry');
          retry.addEventListener('click', () => {
            retry.remove();
            share({ saveOnly });
          });
          root.appendChild(retry);
          if (typeof showToast === 'function') {
            showToast(typeof friendlyError === 'function' ? friendlyError(err) : err.message || 'Could not share');
          }
          return;
        }
      }
      dirty = false;
      if (typeof showToast === 'function') showToast(NS.tt('duniya_story_shared', 'Story shared'));
      layer.close();
      if (typeof renderDuniyaStories === 'function') renderDuniyaStories();
    }

    render();
  };
})();
