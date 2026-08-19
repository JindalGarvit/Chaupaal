/**
 * Profile section order + custom sections (grid / flexible).
 * Persist on users/{uid}.profile.sectionOrder + profile.customSections.
 * Reorder via long-press drag — Edit mode only.
 */
(function () {
  'use strict';

  const BUILTIN = [
    { id: 'bio', label: 'About', builtin: true },
    { id: 'stats', label: 'Stats', builtin: true },
    { id: 'highlights', label: 'Story Highlights', builtin: true },
    { id: 'pinned', label: 'Pinned posts', builtin: true },
    { id: 'media', label: 'Photos & clips', builtin: true },
    { id: 'links', label: 'Links', builtin: true },
    { id: 'duniya', label: 'Duniya / Lehar', builtin: true },
    { id: 'peepal', label: 'Peepal', builtin: true },
  ];

  const CUSTOM_TYPES = [
    { id: 'grid', label: 'Photo grid', hint: 'Highlights-style thumbnails' },
    { id: 'flexible', label: 'Text block', hint: 'Bio-style write-up' },
    { id: 'links', label: 'Link list', hint: 'Website, social, shop' },
    { id: 'image', label: 'Featured image', hint: 'One wide visual' },
    { id: 'quote', label: 'Quote / prompt', hint: 'Pinned thought' },
    { id: 'stack', label: 'Stack', hint: 'One-by-one cards' },
    { id: 'list', label: 'List', hint: 'Vertical list rows' },
  ];

  const LAYOUTS = [
    { id: 'grid', label: 'Grid' },
    { id: 'stack', label: 'Stack' },
    { id: 'list', label: 'List' },
    { id: 'flexible', label: 'Text' },
    { id: 'image', label: 'Featured' },
    { id: 'quote', label: 'Quote' },
    { id: 'links', label: 'Links' },
  ];

  function defaultOrder(profileType) {
    const type =
      profileType ||
      (typeof getProfileType === 'function' ? getProfileType() : 'personal');
    if (type === 'professional') {
      return ['bio', 'links', 'stats', 'media', 'highlights', 'duniya', 'pinned', 'peepal'];
    }
    return ['bio', 'highlights', 'stats', 'media', 'pinned', 'peepal', 'duniya', 'links'];
  }

  function getCustomSections(profile) {
    const list = profile?.customSections || digitalProfile?.customSections || [];
    return Array.isArray(list) ? list.filter((s) => s && s.id) : [];
  }

  function getSectionOrder(profile) {
    const stored = profile?.sectionOrder || digitalProfile?.sectionOrder;
    const customs = getCustomSections(profile);
    const customIds = customs.map((c) => c.id);
    const pType = profile?.profileType || digitalProfile?.profileType;
    const base = Array.isArray(stored) && stored.length ? [...stored] : defaultOrder(pType);
    // Ensure builtins + customs present; drop unknowns
    const known = new Set([...BUILTIN.map((b) => b.id), ...customIds]);
    const ordered = base.filter((id) => known.has(id));
    BUILTIN.forEach((b) => {
      if (!ordered.includes(b.id)) ordered.push(b.id);
    });
    customIds.forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id);
    });
    return ordered;
  }

  function sectionMeta(id, profile) {
    const builtin = BUILTIN.find((b) => b.id === id);
    if (builtin) return { ...builtin };
    const c = getCustomSections(profile).find((x) => x.id === id);
    if (!c) return null;
    return {
      id: c.id,
      label: c.name || 'Section',
      builtin: false,
      type: c.type || 'grid',
      layout: c.layout || c.type || 'grid',
      privacy: c.privacy === 'private' ? 'private' : 'public',
      body: c.body || '',
      items: Array.isArray(c.items) ? c.items : [],
    };
  }

  function persistSections({ sectionOrder, customSections } = {}) {
    if (typeof digitalProfile !== 'undefined') {
      if (sectionOrder) digitalProfile.sectionOrder = sectionOrder;
      if (customSections) digitalProfile.customSections = customSections;
      try {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      } catch (e) {}
    }
    if (!db || !currentUser) return Promise.resolve();
    const patch = {};
    if (sectionOrder) {
      patch['profile.sectionOrder'] = sectionOrder;
      patch.sectionOrder = sectionOrder;
    }
    if (customSections) {
      patch['profile.customSections'] = customSections;
      patch.customSections = customSections;
    }
    return db.collection('users').doc(currentUser.uid).update(patch).catch(() => {});
  }

  function hydrateSectionsFromUserDoc(docData) {
    if (!docData || typeof digitalProfile === 'undefined') return;
    const order = docData.profile?.sectionOrder || docData.sectionOrder;
    const customs = docData.profile?.customSections || docData.customSections;
    const tabs = docData.profile?.tabOrder || docData.tabOrder;
    if (Array.isArray(order)) digitalProfile.sectionOrder = order;
    if (Array.isArray(customs)) digitalProfile.customSections = customs;
    if (Array.isArray(tabs)) digitalProfile.tabOrder = tabs;
    try {
      localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
    } catch (e) {}
  }

  function uid() {
    return typeof crypto?.randomUUID === 'function'
      ? `cs_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
      : `cs_${Date.now().toString(36)}`;
  }

  async function createCustomSection({ name, type, privacy, layout }) {
    const customs = getCustomSections();
    const resolvedType = LAYOUTS.some((l) => l.id === type) ? type : type === 'flexible' ? 'flexible' : 'grid';
    const section = {
      id: uid(),
      name: String(name || 'New section').slice(0, 40),
      type: resolvedType,
      layout: layout || resolvedType,
      privacy: privacy === 'private' ? 'private' : 'public',
      body: '',
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    customs.push(section);
    const order = getSectionOrder();
    order.push(section.id);
    await persistSections({ sectionOrder: order, customSections: customs });
    // Also append to Instagram tabOrder if present
    if (typeof digitalProfile !== 'undefined') {
      const tabs = Array.isArray(digitalProfile.tabOrder) ? digitalProfile.tabOrder : null;
      if (tabs && !tabs.includes(section.id)) {
        tabs.push(section.id);
        digitalProfile.tabOrder = tabs;
        if (typeof persistProfileTabOrder === 'function') persistProfileTabOrder(tabs);
        else if (db && currentUser) {
          db.collection('users')
            .doc(currentUser.uid)
            .update({ 'profile.tabOrder': tabs, tabOrder: tabs })
            .catch(() => {});
        }
      }
    }
    return section;
  }

  async function updateCustomSection(id, patch) {
    const customs = getCustomSections();
    const idx = customs.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    customs[idx] = { ...customs[idx], ...patch, id };
    await persistSections({ customSections: customs });
    return customs[idx];
  }

  async function deleteCustomSection(id) {
    const customs = getCustomSections().filter((c) => c.id !== id);
    const order = getSectionOrder().filter((x) => x !== id);
    await persistSections({ sectionOrder: order, customSections: customs });
  }

  async function saveSectionOrder(order) {
    await persistSections({ sectionOrder: order });
  }

  function visibleSectionsForViewer(profile, { isOwner, editMode } = {}) {
    const order = getSectionOrder(profile);
    return order
      .map((id) => sectionMeta(id, profile))
      .filter(Boolean)
      .filter((s) => {
        if (s.builtin) return true;
        if (s.privacy === 'private') return !!(isOwner || editMode);
        return true;
      });
  }

  function renderSectionShell(meta, { editable, archivedMark } = {}) {
    const esc =
      typeof escapeHtmlText === 'function'
        ? escapeHtmlText
        : (s) => String(s || '').replace(/</g, '&lt;');
    return `
      <section class="profile-section-block" data-section-id="${esc(meta.id)}" data-builtin="${meta.builtin ? '1' : '0'}">
        <div class="profile-section-head">
          ${editable ? `<button type="button" class="profile-section-drag" data-section-drag aria-label="Reorder" title="Long-press to reorder">⠿</button>` : ''}
          <h3 class="profile-section-title">${esc(meta.label)}</h3>
          ${
            !meta.builtin && editable
              ? `<span class="profile-section-privacy ${meta.privacy === 'private' ? 'is-private' : ''}">${
                  meta.privacy === 'private' ? 'Private' : 'Public'
                }</span>
                 <button type="button" class="profile-section-edit-btn" data-edit-custom="${esc(meta.id)}" aria-label="Edit section">✎</button>`
              : !meta.builtin && meta.privacy === 'private'
                ? `<span class="profile-section-privacy is-private">Private</span>`
                : ''
          }
          ${archivedMark || ''}
        </div>
        <div class="profile-section-body" data-section-body="${esc(meta.id)}"></div>
      </section>`;
  }

  function wireSectionReorder(root, { onReorder } = {}) {
    if (!root) return;
    let dragId = null;
    let longPressTimer = null;
    let reordering = false;

    const clearTimer = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    root.querySelectorAll('[data-section-id]').forEach((block) => {
      const handle = block.querySelector('[data-section-drag]') || block.querySelector('.profile-section-head');
      if (!handle || handle.dataset.reorderWired) return;
      handle.dataset.reorderWired = '1';

      const start = (e) => {
        clearTimer();
        longPressTimer = setTimeout(() => {
          reordering = true;
          dragId = block.dataset.sectionId;
          block.classList.add('is-dragging');
          root.classList.add('is-section-reorder');
          if (typeof haptic === 'function') haptic('medium');
        }, 420);
      };
      const end = async () => {
        clearTimer();
        if (!reordering) return;
        reordering = false;
        root.classList.remove('is-section-reorder');
        root.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
        const order = [...root.querySelectorAll('[data-section-id]')].map((el) => el.dataset.sectionId);
        dragId = null;
        await saveSectionOrder(order);
        if (typeof onReorder === 'function') onReorder(order);
        if (typeof showToast === 'function') showToast('Section order saved');
      };

      handle.addEventListener('pointerdown', start);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', () => {
        clearTimer();
        reordering = false;
        block.classList.remove('is-dragging');
        root.classList.remove('is-section-reorder');
      });
      handle.addEventListener('pointermove', (e) => {
        if (!reordering || !dragId) {
          if (longPressTimer && (Math.abs(e.movementX) > 6 || Math.abs(e.movementY) > 6)) clearTimer();
          return;
        }
        e.preventDefault();
        const y = e.clientY;
        const blocks = [...root.querySelectorAll('[data-section-id]')];
        const dragging = blocks.find((b) => b.dataset.sectionId === dragId);
        if (!dragging) return;
        for (const other of blocks) {
          if (other === dragging) continue;
          const rect = other.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (y < mid) {
            root.insertBefore(dragging, other);
            break;
          } else if (other === blocks[blocks.length - 1] && y > mid) {
            root.appendChild(dragging);
          }
        }
      });
    });
  }

  async function openAddSectionSheet(onDone) {
    document.getElementById('addProfileSectionSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'addProfileSectionSheet';
    sheet.className = 'archive-overlay';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-overlay-dismiss' }):'<button type="button" data-overlay-dismiss class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1"><strong>Add section</strong></div>
      </div>
      <div class="add-section-body" style="padding:16px;">
        <label class="story-editor-field">Name
          <input type="text" maxlength="40" data-sec-name placeholder="e.g. Travel, Work, Favorites">
        </label>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 8px;">Type</div>
        <div class="add-section-types" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${CUSTOM_TYPES.map((t,i)=>`<button type="button" class="btn${i===0?' btn--primary':''}" data-sec-type="${t.id}" style="text-align:left;padding:10px 12px;"><strong style="display:block;font-size:13px;">${t.label}</strong><span style="font-size:11px;color:var(--muted);font-weight:500;">${t.hint}</span></button>`).join('')}
        </div>
        <p style="font-size:12px;color:var(--muted);margin:10px 0;">Creates a new profile tab. Pull content from archive or upload profile-only media — no feed post required.</p>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 8px;">Visibility</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn--primary" data-sec-privacy="public" style="flex:1;">Public</button>
          <button type="button" class="btn" data-sec-privacy="private" style="flex:1;">Private</button>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:10px 0;">Private sections are only visible to you.</p>
        <button type="button" class="btn btn--primary btn--block" data-sec-create style="margin-top:16px;">Create section</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      if (sheet.isConnected) sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    else if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }

    let type = 'grid';
    let privacy = 'public';
    const setType = (t) => {
      type = t;
      sheet.querySelectorAll('[data-sec-type]').forEach((b) => {
        b.classList.toggle('btn--primary', b.dataset.secType === t);
      });
    };
    const setPrivacy = (p) => {
      privacy = p;
      sheet.querySelectorAll('[data-sec-privacy]').forEach((b) => {
        b.classList.toggle('btn--primary', b.dataset.secPrivacy === p);
      });
    };
    sheet.querySelectorAll('[data-sec-type]').forEach((b) => b.addEventListener('click', () => setType(b.dataset.secType)));
    sheet.querySelectorAll('[data-sec-privacy]').forEach((b) =>
      b.addEventListener('click', () => setPrivacy(b.dataset.secPrivacy))
    );
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-sec-create]')?.addEventListener('click', async () => {
      const name = sheet.querySelector('[data-sec-name]')?.value?.trim() || 'New section';
      try {
        const section = await createCustomSection({ name, type, privacy });
        close();
        if (typeof onDone === 'function') onDone(section);
        if (typeof showToast === 'function') showToast('Section created');
      } catch (e) {
        if (typeof showToast === 'function') showToast('Could not create section');
      }
    });
  }

  async function openEditCustomSectionSheet(id, onDone) {
    const meta = sectionMeta(id);
    if (!meta || meta.builtin) return;
    document.getElementById('editCustomSectionSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'editCustomSectionSheet';
    sheet.className = 'archive-overlay';
    sheet.setAttribute('data-nav-managed', '1');
    let items = Array.isArray(meta.items) ? [...meta.items] : [];
    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    function renderItems() {
      if (!items.length) return '<div class="public-profile-posts-empty">No items — add from archive or upload</div>';
      return `<div class="cp-sec-items" data-sec-items>${items
        .map(
          (it, i) => `<div class="cp-sec-item" data-item-i="${i}">
            <span class="profile-section-drag" data-item-drag title="Long-press to reorder" aria-label="Reorder">⠿</span>
            ${it.url || it.thumb ? `<img src="${escAttr(it.thumb || it.url)}" alt="">` : ''}
            <div class="cp-sec-item-meta">
              <input type="text" data-item-caption value="${escAttr(it.caption || it.label || '')}" placeholder="Caption / label">
              ${it.url && !it.thumb ? `<small>${escAttr(String(it.url).slice(0, 40))}</small>` : ''}
            </div>
            <button type="button" data-item-remove aria-label="Remove">✕</button>
          </div>`
        )
        .join('')}</div>`;
    }

    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-overlay-dismiss' }):'<button type="button" data-overlay-dismiss class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1"><strong>Edit section</strong></div>
        <button type="button" data-sec-delete style="background:none;border:none;color:var(--red);font-weight:700;cursor:pointer;">Delete</button>
      </div>
      <div style="padding:16px;overflow:auto;max-height:calc(100% - 56px);">
        <label class="story-editor-field">Name
          <input type="text" maxlength="40" data-sec-name value="${escAttr(meta.label)}">
        </label>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 8px;">Layout</div>
        <div class="cp-layout-pills" style="display:flex;flex-wrap:wrap;gap:6px;">
          ${LAYOUTS.map(
            (l) =>
              `<button type="button" class="btn ${(meta.layout || meta.type) === l.id ? 'btn--primary' : ''}" data-sec-layout="${l.id}" style="padding:8px 10px;font-size:12px;">${l.label}</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:8px;margin:14px 0;">
          <button type="button" class="btn ${meta.privacy === 'public' ? 'btn--primary' : ''}" data-sec-privacy="public" style="flex:1;">Public</button>
          <button type="button" class="btn ${meta.privacy === 'private' ? 'btn--primary' : ''}" data-sec-privacy="private" style="flex:1;">Private</button>
        </div>
        <div data-sec-text-wrap>
          <label class="story-editor-field">Text / quote
            <textarea data-sec-body style="width:100%;min-height:90px;border:1.5px solid var(--line);border-radius:12px;padding:12px;font-size:14px;box-sizing:border-box;">${(meta.body || '').replace(/</g, '&lt;')}</textarea>
          </label>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 8px;">Content</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <button type="button" class="btn" data-sec-from-archive>From archive</button>
          <button type="button" class="btn" data-sec-upload>Upload new</button>
          <button type="button" class="btn" data-sec-add-link>Add link</button>
          <button type="button" class="btn" data-sec-add-text>Add text card</button>
        </div>
        <input type="file" accept="image/*,video/*" data-sec-file hidden multiple>
        <div data-sec-items-host>${renderItems()}</div>
        <p style="font-size:12px;color:var(--muted);margin:10px 0;">Profile-only items never require a feed post. Long-press ⠿ to rearrange.</p>
        <button type="button" class="btn btn--primary btn--block" data-sec-save style="margin-top:14px;">Save</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      if (sheet.isConnected) sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    else if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }

    let layout = meta.layout || meta.type || 'grid';
    let privacy = meta.privacy;

    function syncItemCaptions() {
      sheet.querySelectorAll('[data-item-i]').forEach((row) => {
        const i = Number(row.dataset.itemI);
        const cap = row.querySelector('[data-item-caption]')?.value || '';
        if (items[i]) {
          items[i] = { ...items[i], caption: cap, label: cap || items[i].label };
        }
      });
    }

    function refreshItems() {
      syncItemCaptions();
      const host = sheet.querySelector('[data-sec-items-host]');
      if (host) host.innerHTML = renderItems();
      wireItemUi();
    }

    function wireItemUi() {
      sheet.querySelectorAll('[data-item-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          syncItemCaptions();
          const i = Number(btn.closest('[data-item-i]')?.dataset.itemI);
          items.splice(i, 1);
          refreshItems();
        });
      });
      const list = sheet.querySelector('[data-sec-items]');
      if (!list) return;

      let dragI = null;
      let longPressTimer = null;
      let reordering = false;

      const clearTimer = () => {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
      };

      const rebuildFromDom = () => {
        syncItemCaptions();
        const next = [];
        list.querySelectorAll('[data-item-i]').forEach((row) => {
          const i = Number(row.dataset.itemI);
          if (items[i]) next.push(items[i]);
        });
        if (next.length === items.length) items = next;
        refreshItems();
      };

      list.querySelectorAll('[data-item-i]').forEach((row) => {
        const handle = row.querySelector('[data-item-drag]') || row;
        if (handle.dataset.reorderWired) return;
        handle.dataset.reorderWired = '1';

        handle.addEventListener('pointerdown', (e) => {
          if (e.button != null && e.button !== 0) return;
          if (e.target?.closest?.('[data-item-remove], input, textarea, button:not([data-item-drag])')) return;
          clearTimer();
          longPressTimer = setTimeout(() => {
            reordering = true;
            dragI = Number(row.dataset.itemI);
            row.classList.add('is-dragging');
            list.classList.add('is-item-reorder');
            try {
              handle.setPointerCapture?.(e.pointerId);
            } catch (err) {}
            if (typeof haptic === 'function') haptic('medium');
          }, 420);
        });
        handle.addEventListener('pointerup', () => {
          clearTimer();
          if (!reordering) return;
          reordering = false;
          list.classList.remove('is-item-reorder');
          list.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
          dragI = null;
          rebuildFromDom();
        });
        handle.addEventListener('pointercancel', () => {
          clearTimer();
          reordering = false;
          row.classList.remove('is-dragging');
          list.classList.remove('is-item-reorder');
          dragI = null;
        });
        handle.addEventListener('pointermove', (e) => {
          if (!reordering || dragI == null) {
            if (longPressTimer && (Math.abs(e.movementX) > 6 || Math.abs(e.movementY) > 6)) clearTimer();
            return;
          }
          e.preventDefault();
          const y = e.clientY;
          const rows = [...list.querySelectorAll('[data-item-i]')];
          const dragging = rows.find((r) => Number(r.dataset.itemI) === dragI) || row;
          for (const other of rows) {
            if (other === dragging) continue;
            const rect = other.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (y < mid) {
              list.insertBefore(dragging, other);
              break;
            } else if (other === rows[rows.length - 1] && y > mid) {
              list.appendChild(dragging);
            }
          }
        });
      });
    }
    wireItemUi();

    sheet.querySelectorAll('[data-sec-layout]').forEach((b) =>
      b.addEventListener('click', () => {
        layout = b.dataset.secLayout;
        sheet.querySelectorAll('[data-sec-layout]').forEach((x) => x.classList.toggle('btn--primary', x === b));
      })
    );
    sheet.querySelectorAll('[data-sec-privacy]').forEach((b) =>
      b.addEventListener('click', () => {
        privacy = b.dataset.secPrivacy;
        sheet.querySelectorAll('[data-sec-privacy]').forEach((x) => x.classList.toggle('btn--primary', x === b));
      })
    );
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-sec-delete]')?.addEventListener('click', async () => {
      if (!confirm('Delete this section?')) return;
      await deleteCustomSection(id);
      if (typeof digitalProfile !== 'undefined' && Array.isArray(digitalProfile.tabOrder)) {
        digitalProfile.tabOrder = digitalProfile.tabOrder.filter((t) => t !== id);
        if (typeof persistProfileTabOrder === 'function') persistProfileTabOrder(digitalProfile.tabOrder);
      }
      close();
      if (typeof onDone === 'function') onDone(null);
    });

    sheet.querySelector('[data-sec-from-archive]')?.addEventListener('click', () => {
      openArchivePickerForSection((picked) => {
        items = items.concat(picked);
        refreshItems();
      });
    });
    sheet.querySelector('[data-sec-upload]')?.addEventListener('click', () => {
      sheet.querySelector('[data-sec-file]')?.click();
    });
    sheet.querySelector('[data-sec-file]')?.addEventListener('change', async (e) => {
      const files = [...(e.target.files || [])];
      for (const file of files.slice(0, 8)) {
        try {
          let url = '';
          if (typeof uploadOptimizedImage === 'function' && file.type.startsWith('image/')) {
            const res = await uploadOptimizedImage(file, { folder: 'profile-sections' });
            url = res?.url || res || '';
          } else if (typeof uploadFile === 'function') {
            url = await uploadFile(file, 'profile-sections');
          } else {
            url = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.onerror = reject;
              r.readAsDataURL(file);
            });
          }
          if (url) {
            items.push({
              url,
              thumb: url,
              caption: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
              source: 'upload',
              profileOnly: true,
              type: file.type.startsWith('video/') ? 'video' : 'image',
            });
          }
        } catch (err) {
          if (typeof showToast === 'function') showToast('Upload failed');
        }
      }
      e.target.value = '';
      refreshItems();
    });
    sheet.querySelector('[data-sec-add-link]')?.addEventListener('click', () => {
      const url = prompt('Link URL');
      if (!url) return;
      const label = prompt('Label') || 'Link';
      items.push({ url, label, caption: label, type: 'link', profileOnly: true });
      refreshItems();
    });
    sheet.querySelector('[data-sec-add-text]')?.addEventListener('click', () => {
      const text = prompt('Text card');
      if (!text) return;
      items.push({ caption: text, type: 'text', profileOnly: true });
      refreshItems();
    });

    sheet.querySelector('[data-sec-save]')?.addEventListener('click', async () => {
      syncItemCaptions();
      const name = sheet.querySelector('[data-sec-name]')?.value?.trim() || meta.label;
      const body = sheet.querySelector('[data-sec-body]')?.value || '';
      await updateCustomSection(id, {
        name,
        type: layout,
        layout,
        privacy,
        body,
        items,
        updatedAt: Date.now(),
      });
      close();
      if (typeof onDone === 'function') onDone(id);
      if (typeof showToast === 'function') showToast('Section saved');
    });
  }

  async function openArchivePickerForSection(onPick) {
    document.getElementById('cpArchivePickSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'cpArchivePickSheet';
    sheet.className = 'archive-overlay';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-overlay-dismiss' }):'<button type="button" data-overlay-dismiss class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1"><strong>Pick from archive</strong></div>
        <button type="button" class="btn btn--primary" data-pick-done>Add</button>
      </div>
      <div class="cp-archive-pick-tabs" style="display:flex;gap:6px;padding:10px 12px;">
        <button type="button" class="btn btn--primary" data-pick-src="stories">Stories</button>
        <button type="button" class="btn" data-pick-src="duniya">Duniya</button>
        <button type="button" class="btn" data-pick-src="peepal">Peepal</button>
      </div>
      <div data-pick-grid class="cp-hl-pick-grid" style="padding:12px;">Loading…</div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    const selected = [];
    let src = 'stories';

    async function loadSrc(kind) {
      src = kind;
      sheet.querySelectorAll('[data-pick-src]').forEach((b) => b.classList.toggle('btn--primary', b.dataset.pickSrc === kind));
      const grid = sheet.querySelector('[data-pick-grid]');
      grid.innerHTML = 'Loading…';
      try {
        if (kind === 'stories') {
          const archived = typeof storyCall === 'function' ? await storyCall('archive', {}) : { stories: [] };
          const stories = archived.stories || [];
          grid.innerHTML = stories.length
            ? stories
                .slice(0, 48)
                .map((s, i) => {
                  const url = s.thumb || s.media || '';
                  return `<button type="button" class="cp-hl-pick-cell" data-pick-i="${i}" data-url="${escAttr(url)}" data-cap="${escAttr((s.text || '').slice(0, 40))}">
                    ${url ? `<img src="${escAttr(url)}" alt="">` : `<span>${escAttr((s.text || 'Story').slice(0, 20))}</span>`}
                  </button>`;
                })
                .join('')
            : '<div class="public-profile-posts-empty">No stories</div>';
        } else if (db && currentUser) {
          const snap = await db.collection(kind).where('uid', '==', currentUser.uid).limit(40).get();
          const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
          grid.innerHTML = posts.length
            ? posts
                .map((p, i) => {
                  const url = p.thumb || p.media || '';
                  const cap = (p.caption || p.question || '').slice(0, 40);
                  return `<button type="button" class="cp-hl-pick-cell" data-pick-i="${i}" data-url="${escAttr(url)}" data-cap="${escAttr(cap)}" data-post="${escAttr(p.id)}" data-col="${kind}">
                    ${url ? `<img src="${escAttr(url)}" alt="">` : `<span>${escAttr(cap || 'Post')}</span>`}
                  </button>`;
                })
                .join('')
            : `<div class="public-profile-posts-empty">No ${kind} posts</div>`;
        }
      } catch (e) {
        grid.innerHTML = '<div class="public-profile-posts-empty">Unavailable</div>';
      }
      grid.querySelectorAll('.cp-hl-pick-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          btn.classList.toggle('is-selected');
        });
      });
    }

    function escAttr(s) {
      return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    sheet.querySelectorAll('[data-pick-src]').forEach((b) => b.addEventListener('click', () => loadSrc(b.dataset.pickSrc)));
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-pick-done]')?.addEventListener('click', () => {
      const picked = [];
      sheet.querySelectorAll('.cp-hl-pick-cell.is-selected').forEach((btn) => {
        picked.push({
          url: btn.dataset.url || '',
          thumb: btn.dataset.url || '',
          caption: btn.dataset.cap || '',
          source: src,
          postId: btn.dataset.post || '',
          profileOnly: false,
        });
      });
      close();
      if (typeof onPick === 'function') onPick(picked);
    });
    loadSrc('stories');
  }

  function renderCustomSectionBody(meta, { linkify } = {}) {
    const layout = meta.layout || meta.type || 'grid';
    if (layout === 'flexible' || layout === 'quote' || meta.type === 'flexible' || meta.type === 'quote') {
      const text =
        typeof linkifyText === 'function' && linkify !== false
          ? linkifyText(meta.body || '')
          : (meta.body || '').replace(/</g, '&lt;');
      const empty = layout === 'quote' || meta.type === 'quote' ? 'Add a quote' : 'Empty flexible block';
      return text
        ? `<div class="profile-flexible-block${layout === 'quote' || meta.type === 'quote' ? ' profile-quote-block' : ''}">${text}</div>`
        : `<div class="public-profile-posts-empty">${empty}</div>`;
    }
    if (layout === 'links' || meta.type === 'links') {
      const items = meta.items || [];
      if (!items.length && meta.body) {
        return `<div class="profile-flexible-block">${typeof linkifyText === 'function' ? linkifyText(meta.body) : meta.body.replace(/</g, '&lt;')}</div>`;
      }
      if (!items.length) return `<div class="public-profile-posts-empty">No links yet</div>`;
      return `<div class="profile-links-list">${items
        .slice(0, 12)
        .map((it) => {
          const label = (it.label || it.caption || 'Link').replace(/</g, '&lt;');
          if (it.type === 'text' || (!it.url && label)) {
            return `<div class="profile-link-chip profile-link-chip--text">${label}</div>`;
          }
          const url = it.url || '#';
          return `<a class="profile-link-chip" href="${String(url).replace(/"/g, '')}" data-external-link="1">${label}</a>`;
        })
        .join('')}</div>`;
    }
    if (layout === 'image' || meta.type === 'image') {
      const src = meta.items?.[0]?.url || meta.items?.[0]?.thumb || '';
      return src
        ? `<div class="profile-featured-image"><img src="${src}" alt=""></div>`
        : `<div class="public-profile-posts-empty">Add a featured image</div>`;
    }
    const items = meta.items || [];
    if (!items.length) {
      const text =
        meta.body && (layout === 'stack' || layout === 'list')
          ? `<div class="profile-flexible-block">${typeof linkifyText === 'function' ? linkifyText(meta.body) : meta.body.replace(/</g, '&lt;')}</div>`
          : '';
      return text || `<div class="public-profile-posts-empty">No items yet</div>`;
    }
    if (layout === 'stack') {
      return `<div class="cp-stack-layout">${items
        .slice(0, 20)
        .map((it) => {
          const src = it.url || it.thumb || '';
          const cap = (it.caption || it.label || '').replace(/</g, '&lt;');
          if (it.type === 'text' || (!src && cap)) return `<div class="cp-stack-card"><p>${cap}</p></div>`;
          if (it.type === 'link')
            return `<a class="cp-stack-card" href="${String(it.url || '#').replace(/"/g, '')}" data-external-link="1">${cap || 'Link'}</a>`;
          return `<div class="cp-stack-card">${src ? `<img src="${src}" alt="">` : ''}${cap ? `<p>${cap}</p>` : ''}</div>`;
        })
        .join('')}</div>`;
    }
    if (layout === 'list') {
      return `<div class="cp-list-layout">${items
        .slice(0, 24)
        .map((it) => {
          const src = it.url || it.thumb || '';
          const cap = (it.caption || it.label || 'Item').replace(/</g, '&lt;');
          if (it.type === 'link' || (it.url && it.type !== 'image' && it.type !== 'video' && !it.thumb && !String(it.url).match(/\.(jpe?g|png|gif|webp|mp4)/i))) {
            return `<a class="cp-list-row cp-list-row--link" href="${String(it.url || '#').replace(/"/g, '')}" data-external-link="1"><span>${cap || 'Link'}</span></a>`;
          }
          if (it.type === 'text' || (!src && cap)) {
            return `<div class="cp-list-row cp-list-row--text"><span>${cap}</span></div>`;
          }
          return `<div class="cp-list-row">${src ? `<img src="${src}" alt="">` : ''}<span>${cap}</span></div>`;
        })
        .join('')}</div>`;
    }
    return `<div class="public-profile-posts">${items
      .slice(0, 12)
      .map((it) => {
        const src = it.url || it.thumb || '';
        return src
          ? `<div class="public-profile-post-cell"><img src="${src}" alt=""></div>`
          : `<div class="public-profile-post-cell"><span>${(it.caption || '').slice(0, 40)}</span></div>`;
      })
      .join('')}</div>`;
  }

  window.PROFILE_BUILTIN_SECTIONS = BUILTIN;
  window.PROFILE_CUSTOM_SECTION_TYPES = CUSTOM_TYPES;
  window.PROFILE_SECTION_LAYOUTS = LAYOUTS;
  window.openArchivePickerForSection = openArchivePickerForSection;
  window.getProfileSectionOrder = getSectionOrder;
  window.getCustomProfileSections = getCustomSections;
  window.visibleProfileSections = visibleSectionsForViewer;
  window.renderProfileSectionShell = renderSectionShell;
  window.wireProfileSectionReorder = wireSectionReorder;
  window.openAddProfileSectionSheet = openAddSectionSheet;
  window.openEditCustomSectionSheet = openEditCustomSectionSheet;
  window.renderCustomSectionBody = renderCustomSectionBody;
  window.hydrateProfileSectionsFromUserDoc = hydrateSectionsFromUserDoc;
  window.persistProfileSections = persistSections;
  window.createCustomProfileSection = createCustomSection;
  window.profileSectionMeta = sectionMeta;
})();
