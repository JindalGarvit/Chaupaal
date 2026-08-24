/**
 * Instagram-structured profile body: Highlights above tabs,
 * then Profile (dating canvas) · Duniya 3×3 · Peepal 2×2 · custom tabs.
 * Migrates legacy sectionOrder → tabOrder without wiping customs.
 */
(function () {
  'use strict';

  const CORE_TABS = [
    { id: 'digital', label: 'Digital', builtin: true },
    { id: 'duniya', label: 'Duniya', builtin: true },
    { id: 'peepal', label: 'Peepal', builtin: true },
  ];

  function coreTabLabel(tab) {
    if (!tab) return '';
    if (tab.id === 'digital' && typeof t === 'function') {
      try {
        const v = t('profile_tab_digital', 'Digital');
        if (v && v !== 'profile_tab_digital') return v;
      } catch (e) {}
    }
    return tab.label || tab.id;
  }

  const DIGITAL_BLOCKS = ['bio', 'prompts', 'about', 'lifestyle', 'media', 'links', 'stats', 'pinned'];

  function esc(s) {
    return typeof escapeHtmlText === 'function'
      ? escapeHtmlText(s)
      : String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');
  }

  function getCustoms(profile) {
    if (typeof getCustomProfileSections === 'function') return getCustomProfileSections(profile);
    const list = profile?.customSections || digitalProfile?.customSections || [];
    return Array.isArray(list) ? list.filter((s) => s && s.id) : [];
  }

  /** Map legacy sectionOrder → tabOrder once. */
  function migrateTabOrder(profile) {
    const stored = profile?.tabOrder || digitalProfile?.tabOrder;
    if (Array.isArray(stored) && stored.length) {
      return ensureTabOrder(stored, profile);
    }
    const sectionOrder =
      (typeof getProfileSectionOrder === 'function' ? getProfileSectionOrder(profile) : null) ||
      profile?.sectionOrder ||
      digitalProfile?.sectionOrder ||
      [];
    const customs = getCustoms(profile);
    const customIds = customs.map((c) => c.id);
    // Prefer order of customs as they appeared in sectionOrder; core tabs locked first
    const customOrdered = sectionOrder.filter((id) => customIds.includes(id));
    customIds.forEach((id) => {
      if (!customOrdered.includes(id)) customOrdered.push(id);
    });
    const tabOrder = ['digital', 'duniya', 'peepal', ...customOrdered];
    persistTabOrder(tabOrder, profile);
    return tabOrder;
  }

  function ensureTabOrder(order, profile) {
    const customs = getCustoms(profile);
    const customIds = customs.map((c) => c.id);
    const known = new Set(['digital', 'duniya', 'peepal', ...customIds]);
    const out = order.filter((id) => known.has(id));
    ['digital', 'duniya', 'peepal'].forEach((id) => {
      if (!out.includes(id)) out.splice(['digital', 'duniya', 'peepal'].indexOf(id), 0, id);
    });
    // Keep core tabs in locked positions 0-2
    const cores = ['digital', 'duniya', 'peepal'];
    const rest = out.filter((id) => !cores.includes(id));
    customIds.forEach((id) => {
      if (!rest.includes(id)) rest.push(id);
    });
    return [...cores, ...rest];
  }

  function persistTabOrder(tabOrder) {
    if (typeof digitalProfile !== 'undefined') {
      digitalProfile.tabOrder = tabOrder;
      try {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      } catch (e) {}
    }
    if (!db || !currentUser) return Promise.resolve();
    return db
      .collection('users')
      .doc(currentUser.uid)
      .update({ 'profile.tabOrder': tabOrder, tabOrder })
      .catch(() => {});
  }

  function visibleTabs(profile, { isOwner, editMode } = {}) {
    const order = migrateTabOrder(profile);
    const customs = getCustoms(profile);
    return order
      .map((id) => {
        const core = CORE_TABS.find((t) => t.id === id);
        if (core) return { ...core, label: coreTabLabel(core) };
        const c = customs.find((x) => x.id === id);
        if (!c) return null;
        if (c.privacy === 'private' && !(isOwner || editMode)) return null;
        return {
          id: c.id,
          label: c.name || 'Section',
          builtin: false,
          type: c.type || 'grid',
          privacy: c.privacy || 'public',
          layout: c.layout || c.type || 'grid',
          body: c.body || '',
          items: Array.isArray(c.items) ? c.items : [],
        };
      })
      .filter(Boolean);
  }

  function chipRow(items) {
    if (!items?.length) return '';
    return `<div class="cp-digital-chips">${items
      .slice(0, 12)
      .map((x) => `<span class="cp-digital-chip">${esc(x)}</span>`)
      .join('')}</div>`;
  }

  function promptCards(dp) {
    // Prompts only on Digital (Q7C) — icebreakers stay chat/discovery
    const prompts = Array.isArray(dp.prompts) ? dp.prompts.filter((p) => p?.answer) : [];
    return prompts
      .slice(0, 6)
      .map(
        (p) =>
          `<div class="cp-prompt-card"><span>${esc(p.prompt || p.question || 'Prompt')}</span><p>${esc(p.answer)}</p></div>`
      )
      .join('');
  }

  function aboutRows(dp, view) {
    const rows = [];
    const push = (label, val) => {
      if (val == null || val === '' || (Array.isArray(val) && !val.length)) return;
      rows.push(`<div class="cp-about-row"><dt>${esc(label)}</dt><dd>${esc(Array.isArray(val) ? val.join(', ') : val)}</dd></div>`);
    };
    if (view?.fields?.length) {
      return view.fields
        .slice(0, 10)
        .map((f) => `<div class="cp-about-row"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
        .join('');
    }
    push('City', dp.currentCity);
    push('Occupation', dp.occupation);
    push('Looking for', dp.lookingFor);
    push('Relationship', dp.relationshipStatus);
    push('Height', dp.height);
    push('Languages', dp.languages);
    return rows.join('');
  }

  function customBlockBody(block) {
    if (block.type === 'emoji') {
      return `<div class="dp-mood-card"><span class="dp-mood-emoji">${esc(block.emoji || '✨')}</span><p>${esc(block.body || block.label || 'Mood')}</p></div>`;
    }
    if (block.type === 'quote') {
      const q = block.quote || block.body || '';
      return q
        ? `<blockquote class="dp-quote-card">“${esc(q)}”</blockquote>`
        : `<div class="public-profile-posts-empty">Add a quote</div>`;
    }
    if (block.type === 'links' && Array.isArray(block.items) && block.items.length) {
      return `<div class="profile-links-list">${block.items
        .slice(0, 8)
        .map((l) => `<a class="profile-link-chip" href="${esc(l.url || '#')}" data-external-link="1">${esc(l.label || 'Link')}</a>`)
        .join('')}</div>`;
    }
    if (block.type === 'voice' && block.voiceUrl) {
      return `<div class="dp-voice-card"><audio controls src="${esc(block.voiceUrl)}" preload="metadata"></audio><p>${esc(block.body || 'Voice note')}</p></div>`;
    }
    if ((block.type === 'video' || block.videoUrl) && block.videoUrl) {
      return `<div class="dp-featured-media dp-featured-video"><video src="${esc(block.videoUrl)}" controls playsinline preload="metadata"></video>${block.body ? `<p>${esc(block.body)}</p>` : ''}</div>`;
    }
    if (block.mediaUrl) {
      return `<div class="dp-featured-media"><img src="${esc(block.mediaUrl)}" alt="">${block.body ? `<p>${esc(block.body)}</p>` : ''}</div>`;
    }
    if (block.body) {
      return `<div class="profile-flexible-block">${
        typeof linkifyText === 'function' ? linkifyText(block.body) : esc(block.body)
      }</div>`;
    }
    return `<div class="public-profile-posts-empty">Empty block</div>`;
  }

  function openDigitalBlockEditSheet(blockId, onDone) {
    if (typeof DigitalLayout === 'undefined') return;
    const layout = DigitalLayout.getDigitalLayout();
    const block = layout.blocks.find((b) => b.id === blockId);
    if (!block || block.type === 'builtin') return;
    document.getElementById('dpBlockEditSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'dpBlockEditSheet';
    sheet.className = 'archive-overlay dp-catalog-sheet';
    sheet.dataset.navManaged = '1';
    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const type = block.type || 'flexible';
    const items = Array.isArray(block.items) ? block.items.slice() : [];
    let mediaUrl = block.mediaUrl || '';
    let videoUrl = block.videoUrl || '';
    let voiceUrl = block.voiceUrl || '';

    const typeFields = () => {
      if (type === 'quote') {
        return `<label class="story-editor-field">Quote<textarea data-ed-quote rows="4" maxlength="400">${escAttr(block.quote || block.body || '')}</textarea></label>`;
      }
      if (type === 'emoji') {
        return `<label class="story-editor-field">Emoji<input type="text" data-ed-emoji maxlength="8" value="${escAttr(block.emoji || '✨')}"></label>
          <label class="story-editor-field">Caption<input type="text" data-ed-body maxlength="80" value="${escAttr(block.body || '')}"></label>`;
      }
      if (type === 'links') {
        return `<div class="dp-link-edit-list" data-ed-links>
          ${[0, 1, 2, 3]
            .map(
              (i) =>
                `<div class="dp-link-edit-row">
                  <input type="text" data-link-label placeholder="Label" value="${escAttr(items[i]?.label || '')}">
                  <input type="url" data-link-url placeholder="https://" value="${escAttr(items[i]?.url || '')}">
                </div>`
            )
            .join('')}
        </div>`;
      }
      if (type === 'media') {
        return `<div class="dp-media-edit">
          ${mediaUrl ? `<img class="dp-edit-preview" src="${escAttr(mediaUrl)}" alt="">` : '<p class="public-profile-posts-empty">No photo yet</p>'}
          <label class="btn">Choose photo<input type="file" accept="image/*" data-ed-file-photo hidden></label>
          <label class="story-editor-field">Caption<input type="text" data-ed-body maxlength="120" value="${escAttr(block.body || '')}"></label>
        </div>`;
      }
      if (type === 'video') {
        return `<div class="dp-media-edit">
          ${videoUrl ? `<video class="dp-edit-preview" src="${escAttr(videoUrl)}" controls playsinline></video>` : '<p class="public-profile-posts-empty">No video yet</p>'}
          <label class="btn">Choose video (≤30s)<input type="file" accept="video/*" data-ed-file-video hidden></label>
          <label class="story-editor-field">Caption<input type="text" data-ed-body maxlength="120" value="${escAttr(block.body || '')}"></label>
        </div>`;
      }
      if (type === 'voice') {
        return `<div class="dp-media-edit">
          ${voiceUrl ? `<audio controls src="${escAttr(voiceUrl)}"></audio>` : '<p class="public-profile-posts-empty">No voice note yet</p>'}
          <label class="btn">Choose audio<input type="file" accept="audio/*,.m4a,.mp3,.webm" data-ed-file-voice hidden></label>
          <label class="story-editor-field">Caption<input type="text" data-ed-body maxlength="80" value="${escAttr(block.body || '')}"></label>
        </div>`;
      }
      return `<label class="story-editor-field">Title<input type="text" data-ed-label maxlength="40" value="${escAttr(block.label || '')}"></label>
        <label class="story-editor-field">Text<textarea data-ed-body rows="5" maxlength="800">${escAttr(block.body || '')}</textarea></label>`;
    };

    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-dismiss' }) : '<button type="button" data-dismiss class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>Edit · ${esc(block.label || type)}</strong></div>
      </div>
      <div class="dp-block-edit-body" style="padding:16px;overflow:auto;">
        ${type !== 'flexible' && type !== 'emoji' && type !== 'quote' && type !== 'links' ? '' : ''}
        <label class="story-editor-field">Section name<input type="text" data-ed-label maxlength="40" value="${escAttr(block.label || '')}"></label>
        ${typeFields()}
        <button type="button" class="btn btn--primary btn--block" data-ed-save style="margin-top:16px;">Save to Base</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-dismiss]')?.addEventListener('click', close);

    async function uploadFile(file, kind) {
      if (!file) return null;
      if (typeof showToast === 'function') showToast('Uploading…');
      let remote = null;
      try {
        if (kind === 'photo' && typeof uploadOptimizedImage === 'function') {
          const up = await uploadOptimizedImage(file, { folder: 'digital-blocks' });
          remote = up.media || up.url;
        } else if (kind === 'video' && typeof uploadVideoFile === 'function') {
          const up = await uploadVideoFile(file, { folder: 'digital-blocks' });
          remote = up.media || up.url;
        } else if (kind === 'voice' && typeof uploadToCloudinary === 'function') {
          const up = await uploadToCloudinary(file, { resourceType: 'video', folder: 'digital-voice' });
          remote = up.secure_url || up.url;
        }
      } catch (e) {
        if (typeof showToast === 'function') showToast('Upload failed');
        return null;
      }
      return remote;
    }

    sheet.querySelector('[data-ed-file-photo]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const url = await uploadFile(file, 'photo');
      if (url) {
        mediaUrl = url;
        const prev = sheet.querySelector('.dp-edit-preview') || sheet.querySelector('.public-profile-posts-empty');
        if (prev) {
          const img = document.createElement('img');
          img.className = 'dp-edit-preview';
          img.src = url;
          prev.replaceWith(img);
        }
        if (typeof DigitalLayout.arcadeBurst === 'function') DigitalLayout.arcadeBurst(sheet);
      }
    });
    sheet.querySelector('[data-ed-file-video]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const url = await uploadFile(file, 'video');
      if (url) {
        videoUrl = url;
        if (typeof DigitalLayout.arcadeBurst === 'function') DigitalLayout.arcadeBurst(sheet);
        if (typeof showToast === 'function') showToast('Video ready');
      }
    });
    sheet.querySelector('[data-ed-file-voice]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const url = await uploadFile(file, 'voice');
      if (url) {
        voiceUrl = url;
        if (typeof DigitalLayout.arcadeBurst === 'function') DigitalLayout.arcadeBurst(sheet);
        if (typeof showToast === 'function') showToast('Voice ready');
      }
    });

    sheet.querySelector('[data-ed-save]')?.addEventListener('click', async () => {
      const patch = {
        label: sheet.querySelector('[data-ed-label]')?.value?.trim() || block.label,
        body: sheet.querySelector('[data-ed-body]')?.value?.trim() || '',
      };
      if (type === 'quote') {
        patch.quote = sheet.querySelector('[data-ed-quote]')?.value?.trim() || '';
        patch.body = patch.quote;
      }
      if (type === 'emoji') {
        patch.emoji = sheet.querySelector('[data-ed-emoji]')?.value?.trim() || '✨';
      }
      if (type === 'links') {
        const nextItems = [];
        sheet.querySelectorAll('.dp-link-edit-row').forEach((row) => {
          const label = row.querySelector('[data-link-label]')?.value?.trim() || '';
          const url = row.querySelector('[data-link-url]')?.value?.trim() || '';
          if (url) nextItems.push({ label: label || 'Link', url });
        });
        patch.items = nextItems;
      }
      if (type === 'media') patch.mediaUrl = mediaUrl;
      if (type === 'video') patch.videoUrl = videoUrl;
      if (type === 'voice') patch.voiceUrl = voiceUrl;
      await DigitalLayout.updateDigitalBlock(blockId, patch);
      DigitalLayout.arcadeBurst(sheet);
      if (typeof showToast === 'function') showToast('Block saved');
      close();
      if (typeof onDone === 'function') onDone();
    });
  }

  function renderDigitalPane(dp, { isOwner, view, editable, isFriend } = {}) {
    const DL = typeof DigitalLayout !== 'undefined' ? DigitalLayout : null;
    const theme = DL?.getProfileTheme?.(dp) || {};
    const blocks = DL?.visibleDigitalBlocks
      ? DL.visibleDigitalBlocks(dp, { isOwner, editMode: editable, isFriend })
      : [];
    const interests = [...new Set([...(dp.interests || []), ...(Array.isArray(dp.hobbies) ? dp.hobbies : [])])].filter(
      Boolean
    );
    const lifestyle = [dp.diet, dp.drinking, dp.smoking, dp.fitness].filter(Boolean);
    const prompts = promptCards(dp);
    const about = aboutRows(dp, view);

    function builtinInner(id) {
      if (id === 'bio') {
        const bio = String(dp.bio || '').trim();
        return bio
          ? typeof linkifyText === 'function'
            ? linkifyText(bio)
            : esc(bio)
          : `<div class="public-profile-posts-empty">${isOwner ? 'Add a bio — build your Base' : 'No bio yet'}</div>`;
      }
      if (id === 'prompts') {
        return prompts
          ? `<div class="cp-prompt-stack">${prompts}</div>`
          : isOwner
            ? `<div class="public-profile-posts-empty">Add prompts · Chat openers live in discovery/chat</div>`
            : '';
      }
      if (id === 'about') return about ? `<dl class="cp-about-dl">${about}</dl>` : '';
      if (id === 'interests') return interests.length ? chipRow(interests) : '';
      if (id === 'lifestyle') return lifestyle.length ? chipRow(lifestyle) : '';
      if (id === 'media') return `<div data-lazy-media></div>`;
      if (id === 'links') return `<div data-lazy-links></div>`;
      if (id === 'stats') return `<div data-lazy-stats></div>`;
      if (id === 'pinned') return `<div data-lazy-pinned></div>`;
      if (id === 'dangal') return `<div class="dangal-profile-host" data-lazy-dangal></div>`;
      return '';
    }

    const useLayout = blocks.length > 0;
    const sectionsHtml = useLayout
      ? blocks
          .map((b) => {
            const accent = b.accent || theme.accent || 'var(--red)';
            const isBuiltin = b.type === 'builtin' || (DL?.BUILTIN_BLOCKS || []).some((x) => x.id === b.id);
            const inner = isBuiltin ? builtinInner(b.id) : customBlockBody(b);
            if (!editable && !inner) return '';
            const hiddenMark = b.visible === false ? ' is-owner-hidden' : '';
            const editChrome = editable
              ? `<div class="dp-block-chrome">
                  <button type="button" class="dp-drag-handle" data-dp-drag="${esc(b.id)}" title="Drag to reorder" aria-label="Reorder">⠿</button>
                  <span class="dp-block-label">${esc(b.label || b.id)}</span>
                  <button type="button" class="dp-chip" data-dp-hide="${esc(b.id)}">${b.visible === false ? 'Unhide' : 'Hide'}</button>
                  <button type="button" class="dp-chip" data-dp-privacy="${esc(b.id)}" data-privacy="${esc(b.privacy || 'public')}">${esc(b.privacy || 'public')}</button>
                  ${
                    isBuiltin
                      ? ''
                      : `<button type="button" class="dp-chip" data-dp-edit="${esc(b.id)}">Edit</button><button type="button" class="dp-chip dp-chip--danger" data-dp-remove="${esc(b.id)}">Remove</button>`
                  }
                </div>`
              : `<h3 class="cp-digital-h">${esc(b.label || b.id)}</h3>`;
            return `<section class="cp-digital-block dp-arcade-block${hiddenMark}" data-digital-block="${esc(b.id)}" data-block-id="${esc(b.id)}" style="--block-accent:${accent}">
              ${editChrome}
              <div class="dp-block-body">${inner || `<div class="public-profile-posts-empty">Empty — fill or hide</div>`}</div>
            </section>`;
          })
          .join('')
      : null;

    // Fallback if DigitalLayout missing
    if (!useLayout) {
      return `
      <div class="cp-digital-pane" data-dp-root>
        <section class="cp-digital-block" data-digital-block="bio">
          <h3 class="cp-digital-h">About</h3>
          <div class="profile-flexible-block">${builtinInner('bio')}</div>
        </section>
      </div>`;
    }

    return `
      <div class="cp-digital-pane dp-arcade-pane" data-dp-root data-dp-frame="${esc(theme.frameId || 'plain')}">
        ${
          editable
            ? `<div class="dp-edit-toolbar">
                <button type="button" class="btn btn--primary dp-add-block-btn" data-dp-add>＋ Add section</button>
                <button type="button" class="btn" data-dp-theme>Base palette</button>
                <span class="dp-edit-hint">Drag ⠿ · Hide · Privacy · Arcade juice on save</span>
              </div>`
            : ''
        }
        <div class="dp-block-stack" data-dp-stack>${sectionsHtml}</div>
      </div>`;
  }

  function openDigitalBlockCatalog(onPicked) {
    document.getElementById('dpBlockCatalog')?.remove();
    const catalog = (typeof DigitalLayout !== 'undefined' && DigitalLayout.BLOCK_CATALOG) || [];
    const sheet = document.createElement('div');
    sheet.id = 'dpBlockCatalog';
    sheet.className = 'archive-overlay dp-catalog-sheet';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-dismiss' }) : '<button type="button" data-dismiss class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>Add to your Base</strong></div>
      </div>
      <div class="dp-catalog-grid">
        ${catalog
          .map(
            (c) =>
              `<button type="button" class="dp-catalog-card" data-type="${esc(c.type)}" style="--block-accent:${esc(c.accent)}">
                <span class="dp-catalog-emoji">${c.emoji || '➕'}</span>
                <strong>${esc(c.label)}</strong>
                <small>${esc(c.hint || '')}</small>
              </button>`
          )
          .join('')}
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-dismiss]')?.addEventListener('click', close);
    sheet.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const spec = catalog.find((c) => c.type === type) || { type, label: type };
        close();
        if (typeof DigitalLayout?.createCustomDigitalBlock === 'function') {
          const block = await DigitalLayout.createCustomDigitalBlock(spec);
          if (typeof onPicked === 'function') onPicked(block);
        }
      });
    });
  }

  function openBasePalettePicker(onDone) {
    if (typeof DigitalLayout === 'undefined') return;
    document.getElementById('dpPalettePicker')?.remove();
    const DL = DigitalLayout;
    const theme = DL.getProfileTheme();
    let pct = 0;
    try {
      if (typeof calcProfileCompletion === 'function') {
        const c = calcProfileCompletion();
        pct = Number(c?.pct || c || 0);
      }
    } catch (e) {}
    const unlocked = new Set(DL.unlockCosmeticIds(pct).concat(theme.unlocked || []));
    const sheet = document.createElement('div');
    sheet.id = 'dpPalettePicker';
    sheet.className = 'archive-overlay dp-catalog-sheet';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-dismiss' }) : '<button type="button" data-dismiss class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>Base palette</strong></div>
      </div>
      <div class="dp-palette-section"><h4>Colors</h4>
        <div class="dp-palette-row">${DL.PALETTES.map(
          (p) =>
            `<button type="button" class="dp-swatch${unlocked.has(p.id) ? '' : ' is-locked'}${theme.paletteId === p.id ? ' is-active' : ''}" data-palette="${esc(p.id)}" style="--sw:${esc(p.accent)}" ${unlocked.has(p.id) ? '' : 'disabled'} title="${unlocked.has(p.id) ? esc(p.name) : `Reach ${p.unlockAt}% to unlock`}">
              <span></span>${esc(p.name)}${unlocked.has(p.id) ? '' : ` · ${p.unlockAt}%`}
            </button>`
        ).join('')}</div>
      </div>
      <div class="dp-palette-section"><h4>Frames</h4>
        <div class="dp-palette-row">${DL.FRAMES.map(
          (f) =>
            `<button type="button" class="dp-swatch${unlocked.has(f.id) ? '' : ' is-locked'}${theme.frameId === f.id ? ' is-active' : ''}" data-frame="${esc(f.id)}" ${unlocked.has(f.id) ? '' : 'disabled'}>${esc(f.name)}${unlocked.has(f.id) ? '' : ` · ${f.unlockAt}%`}</button>`
        ).join('')}</div>
      </div>
      <div class="dp-palette-section"><h4>Highlight rings</h4>
        <div class="dp-palette-row">${DL.RINGS.map(
          (r) =>
            `<button type="button" class="dp-swatch${unlocked.has(r.id) ? '' : ' is-locked'}${theme.ringId === r.id ? ' is-active' : ''}" data-ring="${esc(r.id)}" ${unlocked.has(r.id) ? '' : 'disabled'}>${esc(r.name)}${unlocked.has(r.id) ? '' : ` · ${r.unlockAt}%`}</button>`
        ).join('')}</div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-dismiss]')?.addEventListener('click', close);
    sheet.querySelectorAll('[data-palette]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pal = DL.PALETTES.find((p) => p.id === btn.dataset.palette);
        if (!pal) return;
        const next = await DL.persistProfileTheme({
          paletteId: pal.id,
          accent: pal.accent,
          surface: pal.surface,
          glow: pal.glow,
          unlocked: [...unlocked],
        });
        DL.arcadeBurst(sheet);
        if (typeof showToast === 'function') showToast(`Base: ${pal.name}`);
        close();
        if (typeof onDone === 'function') onDone(next);
      });
    });
    sheet.querySelectorAll('[data-frame]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = await DL.persistProfileTheme({ frameId: btn.dataset.frame, unlocked: [...unlocked] });
        close();
        if (typeof onDone === 'function') onDone(next);
      });
    });
    sheet.querySelectorAll('[data-ring]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = await DL.persistProfileTheme({ ringId: btn.dataset.ring, unlocked: [...unlocked] });
        DL.arcadeBurst(sheet);
        close();
        if (typeof onDone === 'function') onDone(next);
      });
    });
  }

  function wireDigitalPaneControls(pane, { profile, editable, reload } = {}) {
    if (!pane || !editable || typeof DigitalLayout === 'undefined') return;
    const root = pane.querySelector('[data-dp-root]') || pane;
    DigitalLayout.applyProfileThemeToRoot(root, DigitalLayout.getProfileTheme(profile));
    const hl = pane.closest('[data-profile-shell]')?.querySelector('[data-profile-highlights]');
    if (hl) DigitalLayout.applyProfileThemeToRoot(hl, DigitalLayout.getProfileTheme(profile));

    pane.querySelector('[data-dp-add]')?.addEventListener('click', () => {
      openDigitalBlockCatalog(() => {
        if (typeof reload === 'function') reload();
      });
    });
    pane.querySelector('[data-dp-theme]')?.addEventListener('click', () => {
      openBasePalettePicker(() => {
        if (typeof reload === 'function') reload();
      });
    });

    pane.querySelectorAll('[data-dp-hide]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dpHide;
        const layout = DigitalLayout.getDigitalLayout(profile);
        const block = layout.blocks.find((b) => b.id === id);
        await DigitalLayout.updateDigitalBlock(id, { visible: block?.visible === false });
        DigitalLayout.arcadeBurst(pane);
        if (typeof reload === 'function') reload();
      });
    });
    pane.querySelectorAll('[data-dp-privacy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cur = btn.dataset.privacy || 'public';
        const next = cur === 'public' ? 'friends' : cur === 'friends' ? 'private' : 'public';
        await DigitalLayout.updateDigitalBlock(btn.dataset.dpPrivacy, { privacy: next });
        DigitalLayout.arcadeBurst(pane);
        if (typeof reload === 'function') reload();
      });
    });
    pane.querySelectorAll('[data-dp-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await DigitalLayout.removeDigitalBlock(btn.dataset.dpRemove);
        DigitalLayout.arcadeBurst(pane);
        if (typeof reload === 'function') reload();
      });
    });
    pane.querySelectorAll('[data-dp-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDigitalBlockEditSheet(btn.dataset.dpEdit, () => {
          if (typeof reload === 'function') reload();
        });
      });
    });

    const stack = pane.querySelector('[data-dp-stack]');
    if (stack && !stack.dataset.reorderWired) {
      stack.dataset.reorderWired = '1';
      let dragId = null;
      stack.querySelectorAll('[data-dp-drag]').forEach((handle) => {
        handle.addEventListener('pointerdown', (e) => {
          if (e.button != null && e.button !== 0) return;
          dragId = handle.dataset.dpDrag;
          handle.closest('.cp-digital-block')?.classList.add('is-dragging');
          try {
            handle.setPointerCapture?.(e.pointerId);
          } catch (err) {}
        });
        handle.addEventListener('pointerup', async () => {
          stack.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
          if (!dragId) return;
          const ids = [...stack.querySelectorAll('[data-block-id]')].map((el) => el.dataset.blockId);
          dragId = null;
          await DigitalLayout.reorderDigitalBlocks(ids);
          if (typeof showToast === 'function') showToast('Base order saved');
        });
        handle.addEventListener('pointermove', (e) => {
          if (!dragId) return;
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const target = el?.closest?.('[data-block-id]');
          const dragging = stack.querySelector(
            `[data-block-id="${(DigitalLayout.cssEscapeId || ((x) => x))(dragId)}"]`
          );
          if (!target || !dragging || target === dragging) return;
          const rect = target.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) stack.insertBefore(dragging, target);
          else stack.insertBefore(dragging, target.nextSibling);
        });
      });
    }
  }

  async function fillPostGrid(bodyEl, col, profileUid, { isOwner, includeArchived, cols } = {}) {
    if (!bodyEl || !db || !profileUid) return;
    if (typeof renderSkeleton === 'function') renderSkeleton(bodyEl, { variant: 'feed', count: 2 });
    else bodyEl.innerHTML = '<div class="public-profile-posts-empty">Loading…</div>';
    try {
      let snap;
      try {
        snap = await db.collection(col).where('uid', '==', profileUid).orderBy('createdAt', 'desc').limit(48).get();
      } catch (e) {
        snap = await db.collection(col).where('uid', '==', profileUid).limit(48).get();
      }
      let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
      if (col === 'duniya') {
        try {
          let collabSnap;
          try {
            collabSnap = await db.collection(col).where('collabUids', 'array-contains', profileUid).orderBy('createdAt', 'desc').limit(48).get();
          } catch (e) {
            collabSnap = await db.collection(col).where('collabUids', 'array-contains', profileUid).limit(48).get();
          }
          const seen = new Set(posts.map((p) => p.id));
          collabSnap.docs.forEach((d) => {
            if (seen.has(d.id)) return;
            const row = { id: d.id, ...d.data() };
            if (!row.deleted) posts.push(row);
          });
          posts.sort((a, b) => (b.createdAt?.toMillis?.() || b.ts || 0) - (a.createdAt?.toMillis?.() || a.ts || 0));
        } catch (e) {}
      }
      if (!includeArchived || !isOwner) posts = posts.filter((p) => p.archived !== true);
      if (!posts.length) {
        bodyEl.innerHTML = `<div class="cp-grid-empty">
          <strong>No ${col === 'duniya' ? 'Duniya' : 'Peepal'} posts yet</strong>
          <p>${isOwner ? 'When you post, they show up here.' : 'Nothing public here yet.'}</p>
        </div>`;
        return;
      }
      const limit = cols === 2 ? 12 : 24;
      if (col === 'duniya') {
        bodyEl.innerHTML = `<div class="cp-post-grid cp-post-grid--3">${posts
          .slice(0, limit)
          .map((p) => {
            const media = p.thumb || p.media || p.image || (Array.isArray(p.slides) && p.slides[0] && (p.slides[0].thumb || p.slides[0].media)) || '';
            const cellCaption = esc((p.caption || 'Post').slice(0, 40));
            return `<button type="button" class="cp-post-cell" data-open-post="duniya" data-post-id="${esc(p.id)}">
              ${media ? `<img src="${esc(media)}" alt="">` : `<span>${cellCaption}</span>`}
            </button>`;
          })
          .join('')}</div>`;
      } else {
        bodyEl.innerHTML = `<div class="cp-post-grid cp-post-grid--2">${posts
          .slice(0, limit)
          .map((p) => {
            const q = String(p.question || p.caption || '').slice(0, 100);
            return `<button type="button" class="cp-peepal-cell" data-open-post="peepal" data-post-id="${esc(p.id)}">
              <strong>${esc(p.tag || 'Peepal')}</strong>
              <p>${esc(q)}</p>
            </button>`;
          })
          .join('')}</div>`;
      }
      bodyEl.querySelectorAll('[data-open-post]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.postId;
          const kind = btn.dataset.openPost;
          try {
            if (kind === 'duniya' && db) {
              const doc = await db.collection('duniya').doc(id).get();
              if (doc.exists && typeof openDuniyaDetail === 'function') {
                openDuniyaDetail({ id: doc.id, ...doc.data() });
                return;
              }
            }
            if (kind === 'peepal' && db) {
              const doc = await db.collection('peepal').doc(id).get();
              if (doc.exists) {
                const post = { id: doc.id, ...doc.data() };
                if (typeof openPeepalDetail === 'function') openPeepalDetail(post);
                else if (typeof openPeepalPost === 'function') openPeepalPost(id);
                return;
              }
            }
          } catch (e) {}
          if (typeof showToast === 'function') showToast('Could not open post');
        });
      });
    } catch (e) {
      if (typeof renderErrorState === 'function') {
        renderErrorState(bodyEl, {
          title: 'Posts unavailable',
          message: typeof friendlyError === 'function' ? friendlyError(e) : 'Please try again.',
          onRetry: () => fillPostGrid(bodyEl, col, profileUid, { isOwner, includeArchived, cols }),
        });
      } else {
        bodyEl.innerHTML = '<div class="public-profile-posts-empty">Posts unavailable</div>';
      }
    }
  }

  function renderCustomPane(tab, { editable } = {}) {
    const layout = tab.layout || tab.type || 'grid';
    const body =
      typeof renderCustomSectionBody === 'function'
        ? renderCustomSectionBody({ ...tab, layout, type: tab.type || layout })
        : '<div class="public-profile-posts-empty">Empty section</div>';
    return `<div class="cp-custom-pane" data-layout="${esc(layout)}" data-section-id="${esc(tab.id)}">
      ${editable ? `<div class="cp-custom-toolbar">
        <button type="button" class="btn" data-edit-custom="${esc(tab.id)}">Edit section</button>
        <span class="profile-section-drag" data-tab-drag="${esc(tab.id)}" title="Long-press tabs to reorder">⠿</span>
      </div>` : ''}
      <div class="cp-custom-body" data-custom-layout="${esc(layout)}">${body}</div>
    </div>`;
  }

  /** Long-press / pointer reorder for custom profile tabs (matches section reorder). */
  function wireCustomTabReorder(tabBar, { onPersist } = {}) {
    if (!tabBar || tabBar.dataset.tabReorderWired) return;
    tabBar.dataset.tabReorderWired = '1';
    let dragId = null;
    let longPressTimer = null;
    let reordering = false;
    let suppressClick = false;

    const clearTimer = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const customButtons = () =>
      [...tabBar.querySelectorAll('.cp-profile-tab[data-tab]')].filter(
        (b) => !['digital', 'duniya', 'peepal'].includes(b.dataset.tab)
      );

    const endReorder = async () => {
      clearTimer();
      if (!reordering) return;
      reordering = false;
      tabBar.classList.remove('is-tab-reorder');
      tabBar.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
      const order = ['digital', 'duniya', 'peepal'];
      tabBar.querySelectorAll('.cp-profile-tab[data-tab]').forEach((b) => {
        if (!order.includes(b.dataset.tab)) order.push(b.dataset.tab);
      });
      dragId = null;
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 280);
      await persistTabOrder(order);
      if (typeof onPersist === 'function') onPersist(order);
      if (typeof showToast === 'function') showToast('Tab order saved');
    };

    customButtons().forEach((btn) => {
      if (btn.dataset.reorderWired) return;
      btn.dataset.reorderWired = '1';
      btn.title = 'Long-press to reorder';
      btn.setAttribute('aria-label', `${btn.textContent || 'Tab'} — long-press to reorder`);

      btn.addEventListener(
        'click',
        (e) => {
          if (suppressClick || reordering) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        },
        true
      );

      btn.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        clearTimer();
        longPressTimer = setTimeout(() => {
          reordering = true;
          dragId = btn.dataset.tab;
          btn.classList.add('is-dragging');
          tabBar.classList.add('is-tab-reorder');
          try {
            btn.setPointerCapture?.(e.pointerId);
          } catch (err) {}
          if (typeof haptic === 'function') haptic('medium');
        }, 420);
      });
      btn.addEventListener('pointerup', endReorder);
      btn.addEventListener('pointercancel', () => {
        clearTimer();
        reordering = false;
        btn.classList.remove('is-dragging');
        tabBar.classList.remove('is-tab-reorder');
        dragId = null;
      });
      btn.addEventListener('pointermove', (e) => {
        if (!reordering || !dragId) {
          if (longPressTimer && (Math.abs(e.movementX) > 6 || Math.abs(e.movementY) > 6)) clearTimer();
          return;
        }
        e.preventDefault();
        const x = e.clientX;
        const customs = customButtons();
        const dragging = customs.find((b) => b.dataset.tab === dragId);
        if (!dragging) return;
        for (const other of customs) {
          if (other === dragging) continue;
          const rect = other.getBoundingClientRect();
          const mid = rect.left + rect.width / 2;
          if (x < mid) {
            tabBar.insertBefore(dragging, other);
            break;
          } else if (other === customs[customs.length - 1] && x > mid) {
            const addBtn = tabBar.querySelector('[data-add-tab]');
            if (addBtn) tabBar.insertBefore(dragging, addBtn);
            else tabBar.appendChild(dragging);
          }
        }
      });
    });
  }

  const DIGITAL_DEEPEN_KEY = 'chaupaal_digital_deepen_v1';

  function needsDigitalCanvasDeepen(profile) {
    try {
      if (localStorage.getItem(DIGITAL_DEEPEN_KEY) === 'done') return false;
    } catch (e) {}
    const dp = profile || (typeof digitalProfile !== 'undefined' ? digitalProfile : {}) || {};
    const bio = String(dp.bio || '').trim();
    const city = String(dp.currentCity || '').trim();
    const prompts = Array.isArray(dp.prompts) ? dp.prompts.filter((p) => p?.answer) : [];
    return !bio || !city || prompts.length < 1;
  }

  /** Post-signup / first-profile canvas deepen — same digitalProfile + Firestore fields. */
  function openDigitalCanvasDeepen(opts = {}) {
    document.getElementById('digitalCanvasDeepenSheet')?.remove();
    try {
      sessionStorage.setItem('chaupaal_digital_deepen_offered', '1');
    } catch (e) {}
    const dp = (typeof digitalProfile !== 'undefined' ? digitalProfile : {}) || {};
    const bank =
      (typeof PROFILE_PROMPT_BANK !== 'undefined' && Array.isArray(PROFILE_PROMPT_BANK)
        ? PROFILE_PROMPT_BANK
        : []) || [];
    const pick = bank.slice(0, 8);
    const sheet = document.createElement('div');
    sheet.id = 'digitalCanvasDeepenSheet';
    sheet.className = 'archive-overlay digital-canvas-deepen';
    sheet.setAttribute('data-nav-managed', '1');
    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ label: 'Skip', attrs: 'data-overlay-dismiss' }):'<button type="button" data-overlay-dismiss class="cp-back-btn" aria-label="Skip">←</button>'}
        <div style="flex:1"><strong>Build your Base</strong></div>
        <button type="button" class="btn" data-deepen-skip style="font-size:12px;">Skip</button>
      </div>
      <div class="digital-canvas-deepen-body dp-deepen-arcade">
        <div class="dp-mission-chips" aria-hidden="true">
          <span>① Place your photo</span><span>② Add a spark</span><span>③ Drop your city</span>
        </div>
        <div class="auth-profile-canvas digital-canvas-deepen-preview dp-arcade-block" style="--block-accent:var(--dp-accent,var(--red))">
          <div class="auth-profile-canvas-hero">
            <div class="auth-profile-canvas-avatar" aria-hidden="true">🪑</div>
            <div class="auth-canvas-live-name">${esc(dp.displayName || 'Your name')}</div>
            <div class="auth-canvas-live-handle">@${esc((dp.username || 'username').replace(/^@/, ''))}</div>
            <p class="digital-canvas-live-bio" data-live-bio>${esc(dp.bio || 'Your bio will show here')}</p>
            <p class="digital-canvas-live-city" data-live-city>${esc(dp.currentCity ? `📍 ${dp.currentCity}` : 'City on your Digital tab')}</p>
          </div>
          <label class="story-editor-field">Bio · spark
            <textarea data-deepen-bio maxlength="280" rows="3" placeholder="A line or two about you">${escAttr(dp.bio || '')}</textarea>
          </label>
          <label class="story-editor-field">City · mission
            <input type="text" data-deepen-city maxlength="60" placeholder="e.g. Mumbai" value="${escAttr(dp.currentCity || '')}">
          </label>
          <label class="story-editor-field">Prompt · Digital only
            <select data-deepen-prompt-id>
              ${pick
                .map(
                  (p) =>
                    `<option value="${escAttr(p.id)}">${esc(p.text)}</option>`
                )
                .join('')}
            </select>
          </label>
          <label class="story-editor-field">Your answer
            <textarea data-deepen-prompt-ans maxlength="500" rows="2" placeholder="Shows on Digital — chat openers are separate">${escAttr(
              (Array.isArray(dp.prompts) && dp.prompts[0]?.answer) || ''
            )}</textarea>
          </label>
        </div>
      <p class="digital-canvas-deepen-hint">Same Digital stack you’ll edit later — arcade juice, not a form quiz.</p>
        <button type="button" class="btn btn--primary btn--block" data-deepen-save>Save to Base</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    if (typeof DigitalLayout?.applyProfileThemeToRoot === 'function') {
      DigitalLayout.applyProfileThemeToRoot(sheet, DigitalLayout.getProfileTheme(dp));
    }

    const markDone = () => {
      try {
        localStorage.setItem(DIGITAL_DEEPEN_KEY, 'done');
      } catch (e) {}
    };
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      if (sheet.isConnected) sheet.remove();
      if (typeof opts.onDone === 'function') opts.onDone();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    else if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }

    const bioEl = sheet.querySelector('[data-deepen-bio]');
    const cityEl = sheet.querySelector('[data-deepen-city]');
    const liveBio = sheet.querySelector('[data-live-bio]');
    const liveCity = sheet.querySelector('[data-live-city]');
    const syncLive = () => {
      const b = bioEl?.value?.trim() || '';
      const c = cityEl?.value?.trim() || '';
      if (liveBio) liveBio.textContent = b || 'Your bio will show here';
      if (liveCity) liveCity.textContent = c ? `📍 ${c}` : 'City on your Profile tab';
    };
    bioEl?.addEventListener('input', syncLive);
    cityEl?.addEventListener('input', syncLive);
    syncLive();

    const finishSkip = () => {
      markDone();
      close();
    };
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', finishSkip);
    sheet.querySelector('[data-deepen-skip]')?.addEventListener('click', finishSkip);
    sheet.querySelector('[data-deepen-save]')?.addEventListener('click', () => {
      const bio = bioEl?.value?.trim() || '';
      const city = cityEl?.value?.trim() || '';
      const promptId = sheet.querySelector('[data-deepen-prompt-id]')?.value || '';
      const answer = sheet.querySelector('[data-deepen-prompt-ans]')?.value?.trim() || '';
      if (bio && typeof saveProfileField === 'function') saveProfileField('bio', bio);
      else if (bio && typeof digitalProfile !== 'undefined') {
        digitalProfile.bio = bio;
        try {
          localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
        } catch (e) {}
      }
      if (city && typeof saveProfileField === 'function') saveProfileField('currentCity', city);
      else if (city && typeof digitalProfile !== 'undefined') {
        digitalProfile.currentCity = city;
        try {
          localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
        } catch (e) {}
      }
      if (promptId && answer && typeof savePromptAnswer === 'function') {
        savePromptAnswer(promptId, answer);
      } else if (promptId && answer && typeof persistPrompts === 'function') {
        const bankP = bank.find((p) => p.id === promptId);
        persistPrompts([
          {
            promptId,
            answer,
            answeredAt: Date.now(),
            prompt: bankP?.text,
          },
        ]);
      }
      markDone();
      if (typeof DigitalLayout?.arcadeBurst === 'function') DigitalLayout.arcadeBurst(sheet);
      if (typeof showToast === 'function') showToast('Base updated');
      close();
    });
  }

  function maybeOfferDigitalCanvasDeepen(profile) {
    if (!needsDigitalCanvasDeepen(profile)) return false;
    try {
      if (sessionStorage.getItem('chaupaal_digital_deepen_offered') === '1') return false;
      sessionStorage.setItem('chaupaal_digital_deepen_offered', '1');
    } catch (e) {}
    openDigitalCanvasDeepen({ reason: 'first_profile' });
    return true;
  }

  async function mountProfileShell(host, opts = {}) {
    if (!host) return;
    const profileUid = opts.uid || currentUser?.uid;
    if (!profileUid) return;
    const isOwner = opts.isOwner !== false && profileUid === currentUser?.uid;
    const editable = !!opts.editable && isOwner;
    const includeArchived = !!opts.includeArchived && isOwner;
    let profile = opts.profile || (typeof digitalProfile !== 'undefined' ? digitalProfile : {});
    const view = opts.view || null;
    let isFriend = !!opts.isFriend;
    if (!isOwner && !isFriend && profileUid && typeof hydrateRelationships === 'function') {
      try {
        const st = await hydrateRelationships([profileUid]);
        isFriend = !!(st?.[profileUid]?.friend || (typeof relationshipState === 'function' && relationshipState(profileUid)?.friend));
      } catch (e) {}
    }
    // Friends get public+friends Digital blocks (+ field slice) via friend_projection.
    if (!isOwner && isFriend && typeof DigitalLayout?.fetchFriendDigitalProjection === 'function') {
      try {
        const friendProj = await DigitalLayout.fetchFriendDigitalProjection(profileUid);
        if (friendProj?.digitalLayout?.blocks?.length) {
          profile = { ...profile, digitalLayout: friendProj.digitalLayout };
        }
        if (friendProj?.profileSlice && typeof friendProj.profileSlice === 'object') {
          profile = { ...profile, ...friendProj.profileSlice };
        }
      } catch (e) {}
    } else if (!isOwner && isFriend && typeof DigitalLayout?.fetchFriendDigitalLayout === 'function') {
      try {
        const friendLayout = await DigitalLayout.fetchFriendDigitalLayout(profileUid);
        if (friendLayout?.blocks?.length) {
          profile = { ...profile, digitalLayout: friendLayout };
        }
      } catch (e) {}
    }
    const tabs = visibleTabs(profile, { isOwner, editMode: editable });
    const initial = opts.initialTab || 'digital';

    if (typeof DigitalLayout?.applyProfileThemeToRoot === 'function') {
      DigitalLayout.applyProfileThemeToRoot(host, DigitalLayout.getProfileTheme(profile));
    }

    host.innerHTML = `
      <div class="cp-profile-shell dp-themed" data-profile-shell>
        <div class="cp-profile-highlights" data-profile-highlights></div>
        <div class="cp-profile-tabs" role="tablist" data-profile-tabs>
          ${tabs
            .map(
              (t, i) =>
                `<button type="button" class="cp-profile-tab${t.id === initial || (!tabs.find((x) => x.id === initial) && i === 0) ? ' is-active' : ''}" role="tab" data-tab="${esc(t.id)}" aria-selected="${t.id === initial || (!tabs.find((x) => x.id === initial) && i === 0) ? 'true' : 'false'}">${esc(t.label)}</button>`
            )
            .join('')}
          ${editable ? `<button type="button" class="cp-profile-tab cp-profile-tab--add" data-add-tab aria-label="Add section">＋</button>` : ''}
        </div>
        <div class="cp-profile-panes" data-profile-panes>
          ${tabs
            .map((t) => {
              const active = t.id === initial || (!tabs.find((x) => x.id === initial) && t.id === 'digital');
              return `<div class="cp-profile-pane${active ? ' is-active' : ''}" role="tabpanel" data-pane="${esc(t.id)}" ${active ? '' : 'hidden'}></div>`;
            })
            .join('')}
        </div>
      </div>`;

    if (typeof mountProfileHighlights === 'function') {
      await mountProfileHighlights(host.querySelector('[data-profile-highlights]'), {
        uid: profileUid,
        isOwner,
        editable,
      });
    }
    const hlRoot = host.querySelector('[data-profile-highlights]');
    if (hlRoot && typeof DigitalLayout?.applyProfileThemeToRoot === 'function') {
      DigitalLayout.applyProfileThemeToRoot(hlRoot, DigitalLayout.getProfileTheme(profile));
    }

    const loaded = new Set();
    async function activateTab(tabId) {
      host.querySelectorAll('.cp-profile-tab').forEach((b) => {
        const on = b.dataset.tab === tabId;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      host.querySelectorAll('.cp-profile-pane').forEach((p) => {
        const on = p.dataset.pane === tabId;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
      if (loaded.has(tabId)) return;
      loaded.add(tabId);
      const pane = host.querySelector(`[data-pane="${tabId}"]`);
      if (!pane) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      if (tabId === 'digital') {
        const freshProfile =
          isOwner && typeof digitalProfile !== 'undefined' ? digitalProfile : profile;
        pane.innerHTML = renderDigitalPane(freshProfile, {
          isOwner,
          view,
          editable,
          isFriend,
        });
        const reloadDigital = () => {
          loaded.delete('digital');
          activateTab('digital');
        };
        wireDigitalPaneControls(pane, {
          profile: freshProfile,
          editable,
          reload: reloadDigital,
        });
        const fillOpts = { isOwner, profileMedia: freshProfile.profileMedia, profile: freshProfile };
        if (typeof fillProfileSectionBody === 'function') {
          const mediaHost = pane.querySelector('[data-lazy-media]');
          if (mediaHost) await fillProfileSectionBody(mediaHost, 'media', profileUid, fillOpts);
          const linksHost = pane.querySelector('[data-lazy-links]');
          if (linksHost) await fillProfileSectionBody(linksHost, 'links', profileUid, fillOpts);
          const statsHost = pane.querySelector('[data-lazy-stats]');
          if (statsHost) await fillProfileSectionBody(statsHost, 'stats', profileUid, fillOpts);
          const pinnedHost = pane.querySelector('[data-lazy-pinned]');
          if (pinnedHost) await fillProfileSectionBody(pinnedHost, 'pinned', profileUid, fillOpts);
        }
        const dangalHost = pane.querySelector('[data-lazy-dangal]');
        if (dangalHost && typeof renderDangalProfileSection === 'function') {
          await renderDangalProfileSection(profileUid, dangalHost);
        }
        return;
      }
      if (tabId === 'duniya') {
        await fillPostGrid(pane, 'duniya', profileUid, { isOwner, includeArchived, cols: 3 });
        return;
      }
      if (tabId === 'peepal') {
        await fillPostGrid(pane, 'peepal', profileUid, { isOwner, includeArchived, cols: 2 });
        return;
      }
      pane.innerHTML = renderCustomPane(tab, { editable });
      pane.querySelector('[data-edit-custom]')?.addEventListener('click', () => {
        if (typeof openEditCustomSectionSheet === 'function') {
          openEditCustomSectionSheet(tab.id, () => {
            loaded.delete(tab.id);
            activateTab(tab.id);
            if (typeof opts.onCustomChange === 'function') opts.onCustomChange();
          });
        }
      });
    }

    host.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

    const onPostsChanged = () => {
      if (!host.isConnected) {
        document.removeEventListener('chaupaal:profile-posts-changed', onPostsChanged);
        return;
      }
      if (loaded.has('duniya')) {
        const pane = host.querySelector('[data-pane="duniya"]');
        if (pane) fillPostGrid(pane, 'duniya', profileUid, { isOwner, includeArchived, cols: 3 });
      }
      if (loaded.has('peepal')) {
        const pane = host.querySelector('[data-pane="peepal"]');
        if (pane) fillPostGrid(pane, 'peepal', profileUid, { isOwner, includeArchived, cols: 2 });
      }
    };
    document.addEventListener('chaupaal:profile-posts-changed', onPostsChanged);

    host.querySelector('[data-add-tab]')?.addEventListener('click', () => {
      if (typeof openAddProfileSectionSheet === 'function') {
        openAddProfileSectionSheet((section) => {
          if (section?.id) {
            const order = migrateTabOrder(profile);
            if (!order.includes(section.id)) {
              order.push(section.id);
              persistTabOrder(order);
            }
          }
          if (typeof opts.onCustomChange === 'function') opts.onCustomChange();
          else mountProfileShell(host, { ...opts, initialTab: section?.id || 'digital' });
        });
      }
    });

    // Long-press custom tabs to reorder (edit mode — touch + desktop)
    if (editable) {
      const tabBar = host.querySelector('[data-profile-tabs]');
      if (tabBar) wireCustomTabReorder(tabBar);
    }

    const start = tabs.find((t) => t.id === initial)?.id || tabs[0]?.id || 'digital';
    await activateTab(start);
    if (editable && isOwner && typeof maybeOfferProfileCompleteNudge === 'function') {
      setTimeout(() => maybeOfferProfileCompleteNudge({ reason: 'edit' }), 600);
    }
    if (typeof restoreAppShell === 'function') restoreAppShell();
  }

  window.PROFILE_CORE_TABS = CORE_TABS;
  window.PROFILE_DIGITAL_BLOCKS = DIGITAL_BLOCKS;
  window.mountProfileShell = mountProfileShell;
  window.getProfileTabOrder = migrateTabOrder;
  window.persistProfileTabOrder = persistTabOrder;
  window.visibleProfileTabs = visibleTabs;
  window.wireCustomTabReorder = wireCustomTabReorder;
  window.openDigitalCanvasDeepen = openDigitalCanvasDeepen;
  window.needsDigitalCanvasDeepen = needsDigitalCanvasDeepen;
  window.maybeOfferDigitalCanvasDeepen = maybeOfferDigitalCanvasDeepen;
})();
