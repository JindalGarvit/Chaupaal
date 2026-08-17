/**
 * Duniya story canvas editor — crop/trim → overlays → Share.
 */
(function () {
  'use strict';
  const NS = (window.DuniyaStory = window.DuniyaStory || {});
  const MAX_VIDEO_MS = 90 * 1000;
  const FILTERS = ['normal', 'bright', 'contrast', 'warm', 'cool', 'mono', 'fade'];

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
    };
  }

  function bindDrag(el, ov) {
    let sx = 0;
    let sy = 0;
    let ox = ov.x;
    let oy = ov.y;
    const onDown = (e) => {
      if (ov.locked) return;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX;
      sy = p.clientY;
      ox = ov.x;
      oy = ov.y;
      e.stopPropagation();
    };
    const onMove = (e) => {
      if (!sx && !sy) return;
      const p = e.touches ? e.touches[0] : e;
      const host = el.parentElement?.getBoundingClientRect();
      if (!host) return;
      ov.x = Math.max(0.05, Math.min(0.95, ox + (p.clientX - sx) / host.width));
      ov.y = Math.max(0.05, Math.min(0.95, oy + (p.clientY - sy) / host.height));
      el.style.left = ov.x * 100 + '%';
      el.style.top = ov.y * 100 + '%';
    };
    const onUp = () => {
      sx = 0;
      sy = 0;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el._dsUnbind = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
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
    let drawColor = '#E63946';
    let eraser = false;
    const strokes = () => {
      let ov = queue[idx].overlays.find((o) => o.type === 'draw');
      if (!ov) {
        ov = { id: uid(), type: 'draw', x: 0.5, y: 0.5, scale: 1, rotate: 0, z: 2, strokes: [] };
        queue[idx].overlays.push(ov);
      }
      return ov;
    };

    const root = document.createElement('div');
    root.className = 'ds-overlay';
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

    function paintOverlays(stage) {
      stage.querySelectorAll('.ds-ov,.ds-draw-canvas').forEach((n) => n.remove());
      NS.renderOverlaysInto(stage, queue[idx], {});
      stage.querySelectorAll('.ds-ov').forEach((el) => {
        const ov = queue[idx].overlays.find((o) => o.id === el.dataset.ov);
        if (ov) bindDrag(el, ov);
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
            ctx.strokeStyle = s.eraser ? 'rgba(0,0,0,1)' : s.color;
            ctx.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over';
            ctx.lineWidth = s.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            s.points.forEach((p, i) => {
              const x = p.x * canvas.width;
              const y = p.y * canvas.height;
              if (i) ctx.lineTo(x, y);
              else ctx.moveTo(x, y);
            });
            ctx.stroke();
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
          canvas.addEventListener('pointerdown', (e) => {
            cur = { color: drawColor, width: eraser ? 16 : 4, eraser, points: [pt(e)] };
            e.preventDefault();
          });
          canvas.addEventListener('pointermove', (e) => {
            if (!cur) return;
            cur.points.push(pt(e));
            strokes().strokes = (strokes().strokes || []).concat([]);
            if (!strokes().strokes.includes(cur)) strokes().strokes.push(cur);
            replay();
          });
          canvas.addEventListener('pointerup', () => {
            if (cur && cur.points.length > 1) {
              const ov = strokes();
              if (!ov.strokes.includes(cur)) ov.strokes.push(cur);
            }
            cur = null;
          });
        }
      }
    }

    function render() {
      const item = queue[idx];
      const media =
        item.mediaType === 'video'
          ? `<video src="${NS.esc(item.url)}" playsinline ${item.muted ? 'muted' : ''}></video>`
          : `<img src="${NS.esc(item.url)}" alt="">`;
      root.innerHTML = `
        <div class="ds-stage${NS.filterClass(item.filter)}" data-stage>${media}
          ${item.mediaType === 'video' ? `<div class="ds-trim"><input type="range" min="0" max="1000" value="${Math.round((item.trimStartMs / Math.max(item.durationMs, 1)) * 1000)}" data-trim-start><input type="range" min="0" max="1000" value="${Math.round((item.trimEndMs / Math.max(item.durationMs || MAX_VIDEO_MS, 1)) * 1000) || 1000}" data-trim-end><small data-trim-label></small></div>` : ''}
        </div>
        <div class="ds-topbar">
          <button type="button" class="ds-icon-btn" data-close aria-label="Close">✕</button>
          <button type="button" class="ds-icon-btn" data-save aria-label="Save">${NS.tt('story_save', 'Save')}</button>
          <button type="button" class="ds-cta" data-share>${NS.tt('story_share', 'Share')}</button>
        </div>
        <div class="ds-rail">
          <button type="button" data-tool="text" aria-label="Text">Aa</button>
          <button type="button" data-tool="draw" aria-label="Draw">✎</button>
          <button type="button" data-tool="stickers" aria-label="Stickers">☺</button>
          <button type="button" data-tool="music" aria-label="Music">♪</button>
          <button type="button" data-tool="location" aria-label="Location">📍</button>
          <button type="button" data-tool="mention" aria-label="Mention">@</button>
          <button type="button" data-tool="interactive" aria-label="Interactive">◍</button>
          <button type="button" data-tool="filter" aria-label="Filter">☀</button>
          <button type="button" data-tool="crop" aria-label="Crop">⛶</button>
          <button type="button" data-tool="camera" aria-label="Camera">📷</button>
        </div>
        <div class="ds-bottombar">
          <div class="ds-filmstrip" data-strip></div>
        </div>`;
      const stage = root.querySelector('[data-stage]');
      const img = stage.querySelector('img,video');
      if (img && item.mediaType === 'image') {
        img.style.transform = `translate(-50%,-50%) scale(${item.crop.scale}) rotate(${item.rotation}deg)`;
        img.style.position = 'absolute';
        img.style.left = item.crop.x * 100 + '%';
        img.style.top = item.crop.y * 100 + '%';
        img.style.width = '120%';
        img.style.height = '120%';
        img.style.objectFit = 'cover';
      }
      if (item.mediaType === 'video') {
        const v = stage.querySelector('video');
        v.addEventListener('loadedmetadata', () => {
          item.durationMs = Math.round((v.duration || 0) * 1000);
          if (!item.trimEndMs) item.trimEndMs = Math.min(item.durationMs, MAX_VIDEO_MS);
          updateTrim();
        });
        const start = root.querySelector('[data-trim-start]');
        const end = root.querySelector('[data-trim-end]');
        const updateTrim = () => {
          const dur = item.durationMs || MAX_VIDEO_MS;
          item.trimStartMs = Math.round((Number(start.value) / 1000) * dur);
          item.trimEndMs = Math.round((Number(end.value) / 1000) * dur);
          if (item.trimEndMs - item.trimStartMs > MAX_VIDEO_MS) {
            item.trimEndMs = item.trimStartMs + MAX_VIDEO_MS;
            end.value = String(Math.round((item.trimEndMs / dur) * 1000));
          }
          if (item.trimEndMs <= item.trimStartMs) item.trimEndMs = Math.min(dur, item.trimStartMs + 1000);
          const label = root.querySelector('[data-trim-label]');
          if (label) {
            const span = Math.round((item.trimEndMs - item.trimStartMs) / 100) / 10;
            label.textContent =
              dur > MAX_VIDEO_MS
                ? NS.tt('story_trim_needed', 'Trim to 90s or less') + ` · ${span}s`
                : `${span}s`;
          }
        };
        start?.addEventListener('input', updateTrim);
        end?.addEventListener('input', updateTrim);
        updateTrim();
      }
      paintOverlays(stage);
      const strip = root.querySelector('[data-strip]');
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
          render();
        })
      );
      root.querySelector('[data-close]').addEventListener('click', confirmClose);
      root.querySelector('[data-save]').addEventListener('click', () => share({ saveOnly: true }));
      root.querySelector('[data-share]').addEventListener('click', () => share({}));
      root.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => runTool(b.dataset.tool)));
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
        promptSheet(NS.tt('story_text', 'Text'), `<textarea data-t maxlength="140" placeholder="Say something"></textarea>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button type="button" data-style="display">Aa</button>
            <button type="button" data-style="serif">Serif</button>
            <button type="button" data-style="poster">Poster</button>
          </div>`, (sheet, done) => {
          let style = 'display';
          sheet.querySelectorAll('[data-style]').forEach((b) =>
            b.addEventListener('click', () => {
              style = b.dataset.style;
            })
          );
          sheet.querySelector('[data-done]').addEventListener('click', () => {
            const text = sheet.querySelector('[data-t]').value.trim();
            if (text) item.overlays.push({ id: uid(), type: 'text', text, x: 0.5, y: 0.4, scale: 1, rotate: 0, z: 6, color: '#fff', style, align: 'center' });
            done();
            render();
          });
        });
      } else if (tool === 'draw') {
        drawing = !drawing;
        render();
        if (drawing) {
          promptSheet(NS.tt('story_draw', 'Draw'), `
            <div style="display:flex;gap:8px;">
              ${['#E63946', '#F5F5F5', '#2B2730', '#F4C430'].map((c) => `<button type="button" data-c="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:0;"></button>`).join('')}
              <button type="button" data-erase>Eraser</button>
              <button type="button" data-undo>Undo</button>
            </div>`, (sheet) => {
            sheet.querySelectorAll('[data-c]').forEach((b) =>
              b.addEventListener('click', () => {
                drawColor = b.dataset.c;
                eraser = false;
              })
            );
            sheet.querySelector('[data-erase]').addEventListener('click', () => {
              eraser = true;
            });
            sheet.querySelector('[data-undo]').addEventListener('click', () => {
              const ov = item.overlays.find((o) => o.type === 'draw');
              if (ov?.strokes?.length) ov.strokes.pop();
              render();
            });
          });
        }
      } else if (tool === 'stickers') {
        promptSheet(NS.tt('story_stickers', 'Stickers'), `<div data-emoji style="display:flex;flex-wrap:wrap;gap:8px;font-size:28px;">${['🔥','✨','❤️','😂','🙏','☕','🏏','🎵','🌟','🏠'].map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div><button type="button" class="btn" data-gif>GIF</button>`, (sheet, done) => {
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
        });
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
      } else if (tool === 'location' && typeof openLocationComposer === 'function') {
        openLocationComposer({
          onSelect: (loc) => {
            item.location = loc;
            if (!item.overlays.some((o) => o.type === 'location')) {
              item.overlays.push({ id: uid(), type: 'location', x: 0.5, y: 0.16, scale: 1, rotate: 0, z: 8 });
            }
            render();
          },
        });
      } else if (tool === 'mention') {
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
      } else if (tool === 'interactive') {
        const teen = NS.isTeen();
        promptSheet(NS.tt('story_interactive', 'Stickers'), `
          <button type="button" data-k="poll">Poll</button>
          <button type="button" data-k="question">Question</button>
          <button type="button" data-k="quiz">Quiz</button>
          <button type="button" data-k="slider">Slider</button>
          <button type="button" data-k="countdown">Countdown</button>
          <button type="button" data-k="addyours">Add yours</button>
          ${teen ? '' : '<button type="button" data-k="link">Link</button>'}
        `, (sheet, done) => {
          sheet.querySelectorAll('[data-k]').forEach((b) =>
            b.addEventListener('click', () => {
              done();
              addInteractive(b.dataset.k);
            })
          );
        });
      } else if (tool === 'filter') {
        item.filter = FILTERS[(FILTERS.indexOf(item.filter) + 1) % FILTERS.length];
        if (typeof showToast === 'function') showToast(item.filter);
        render();
      } else if (tool === 'crop') {
        item.crop.scale = item.crop.scale >= 1.4 ? 1 : item.crop.scale + 0.2;
        item.rotation = (item.rotation + 90) % 360;
        render();
      } else if (tool === 'camera') {
        NS.pickGallery({
          capture: true,
          onFile: (file) => {
            queue.push(newItem(file));
            idx = queue.length - 1;
            render();
          },
        });
      }
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
          (typeof ownProfileType === 'function' ? ownProfileType() : typeof userProfile !== 'undefined' ? userProfile.profileType : '') ===
          'professional';
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
          if (item.file && typeof processAndUploadMedia === 'function') {
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
            durationMs: item.mediaType === 'video' ? Math.min(MAX_VIDEO_MS, (item.trimEndMs || item.durationMs) - (item.trimStartMs || 0) || item.durationMs) : 6000,
            overlays: item.overlays,
            interactive: item.interactive,
            mentions: item.mentions,
            music: item.music,
            location: item.location,
            filter: item.filter,
            crop: item.crop,
            rotation: item.rotation,
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
