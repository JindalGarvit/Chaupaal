/**
 * Profile section order + custom sections (grid / flexible).
 * Persist on users/{uid}.profile.sectionOrder + profile.customSections.
 * Reorder via long-press drag — Edit mode only.
 */
(function () {
  'use strict';

  const BUILTIN = [
    { id: 'highlights', label: 'Story Highlights', builtin: true },
    { id: 'media', label: 'Photos & clips', builtin: true },
    { id: 'duniya', label: 'Duniya / Lehar', builtin: true },
    { id: 'peepal', label: 'Peepal', builtin: true },
  ];

  function defaultOrder() {
    return BUILTIN.map((s) => s.id);
  }

  function getCustomSections(profile) {
    const list = profile?.customSections || digitalProfile?.customSections || [];
    return Array.isArray(list) ? list.filter((s) => s && s.id) : [];
  }

  function getSectionOrder(profile) {
    const stored = profile?.sectionOrder || digitalProfile?.sectionOrder;
    const customs = getCustomSections(profile);
    const customIds = customs.map((c) => c.id);
    const base = Array.isArray(stored) && stored.length ? [...stored] : defaultOrder();
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
    if (Array.isArray(order)) digitalProfile.sectionOrder = order;
    if (Array.isArray(customs)) digitalProfile.customSections = customs;
    try {
      localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
    } catch (e) {}
  }

  function uid() {
    return typeof crypto?.randomUUID === 'function'
      ? `cs_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
      : `cs_${Date.now().toString(36)}`;
  }

  async function createCustomSection({ name, type, privacy }) {
    const customs = getCustomSections();
    const section = {
      id: uid(),
      name: String(name || 'New section').slice(0, 40),
      type: type === 'flexible' ? 'flexible' : 'grid',
      privacy: privacy === 'private' ? 'private' : 'public',
      body: '',
      items: [],
      createdAt: Date.now(),
    };
    customs.push(section);
    const order = getSectionOrder();
    order.push(section.id);
    await persistSections({ sectionOrder: order, customSections: customs });
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
        <button type="button" data-overlay-dismiss aria-label="Back">←</button>
        <div style="flex:1"><strong>Add section</strong></div>
      </div>
      <div class="add-section-body" style="padding:16px;">
        <label class="story-editor-field">Name
          <input type="text" maxlength="40" data-sec-name placeholder="e.g. Travel, Work, Favorites">
        </label>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 8px;">Type</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn--primary" data-sec-type="grid" style="flex:1;">Grid</button>
          <button type="button" class="btn" data-sec-type="flexible" style="flex:1;">Flexible block</button>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:10px 0;">Grid = Highlights-style thumbnails · Flexible = text + photo write-up</p>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 8px;">Visibility</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn--primary" data-sec-privacy="public" style="flex:1;">Public</button>
          <button type="button" class="btn" data-sec-privacy="private" style="flex:1;">Private</button>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:10px 0;">Private sections are only visible to you — same guarantee as your journal.</p>
        <button type="button" class="btn btn--primary btn--block" data-sec-create style="margin-top:16px;">Create section</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, { onPop: () => sheet.remove() });

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
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      else sheet.remove();
    });
    sheet.querySelector('[data-sec-create]')?.addEventListener('click', async () => {
      const name = sheet.querySelector('[data-sec-name]')?.value?.trim() || 'New section';
      try {
        const section = await createCustomSection({ name, type, privacy });
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
        else sheet.remove();
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
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss>←</button>
        <div style="flex:1"><strong>Edit section</strong></div>
        <button type="button" data-sec-delete style="background:none;border:none;color:var(--red);font-weight:700;cursor:pointer;">Delete</button>
      </div>
      <div style="padding:16px;">
        <label class="story-editor-field">Name
          <input type="text" maxlength="40" data-sec-name value="${(meta.label || '').replace(/"/g, '&quot;')}">
        </label>
        <div style="display:flex;gap:8px;margin:14px 0;">
          <button type="button" class="btn ${meta.type === 'grid' ? 'btn--primary' : ''}" data-sec-type="grid" style="flex:1;">Grid</button>
          <button type="button" class="btn ${meta.type === 'flexible' ? 'btn--primary' : ''}" data-sec-type="flexible" style="flex:1;">Flexible</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button type="button" class="btn ${meta.privacy === 'public' ? 'btn--primary' : ''}" data-sec-privacy="public" style="flex:1;">Public</button>
          <button type="button" class="btn ${meta.privacy === 'private' ? 'btn--primary' : ''}" data-sec-privacy="private" style="flex:1;">Private</button>
        </div>
        ${
          meta.type === 'flexible'
            ? `<textarea data-sec-body style="width:100%;min-height:120px;border:1.5px solid var(--line);border-radius:12px;padding:12px;font-size:14px;box-sizing:border-box;">${(meta.body || '').replace(/</g, '&lt;')}</textarea>`
            : `<p style="font-size:13px;color:var(--muted);">Add photos from Archive or your camera roll (coming into grid items).</p>`
        }
        <button type="button" class="btn btn--primary btn--block" data-sec-save style="margin-top:14px;">Save</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, { onPop: () => sheet.remove() });

    let type = meta.type;
    let privacy = meta.privacy;
    sheet.querySelectorAll('[data-sec-type]').forEach((b) =>
      b.addEventListener('click', () => {
        type = b.dataset.secType;
        sheet.querySelectorAll('[data-sec-type]').forEach((x) => x.classList.toggle('btn--primary', x === b));
      })
    );
    sheet.querySelectorAll('[data-sec-privacy]').forEach((b) =>
      b.addEventListener('click', () => {
        privacy = b.dataset.secPrivacy;
        sheet.querySelectorAll('[data-sec-privacy]').forEach((x) => x.classList.toggle('btn--primary', x === b));
      })
    );
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      else sheet.remove();
    };
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-sec-delete]')?.addEventListener('click', async () => {
      if (!confirm('Delete this section?')) return;
      await deleteCustomSection(id);
      close();
      if (typeof onDone === 'function') onDone(null);
    });
    sheet.querySelector('[data-sec-save]')?.addEventListener('click', async () => {
      const name = sheet.querySelector('[data-sec-name]')?.value?.trim() || meta.label;
      const body = sheet.querySelector('[data-sec-body]')?.value || '';
      await updateCustomSection(id, { name, type, privacy, body });
      close();
      if (typeof onDone === 'function') onDone(id);
      if (typeof showToast === 'function') showToast('Section saved');
    });
  }

  function renderCustomSectionBody(meta, { linkify } = {}) {
    if (meta.type === 'flexible') {
      const text =
        typeof linkifyText === 'function' && linkify !== false
          ? linkifyText(meta.body || '')
          : (meta.body || '').replace(/</g, '&lt;');
      return text
        ? `<div class="profile-flexible-block">${text}</div>`
        : `<div class="public-profile-posts-empty">Empty flexible block</div>`;
    }
    const items = meta.items || [];
    if (!items.length) return `<div class="public-profile-posts-empty">No items yet</div>`;
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
