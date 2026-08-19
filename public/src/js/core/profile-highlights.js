/**
 * Instagram-like story Highlights rail + owner CRUD (create/edit/cover/add/remove/reorder/delete).
 */
(function () {
  'use strict';

  function esc(s) {
    return typeof escapeHtmlText === 'function'
      ? escapeHtmlText(s)
      : String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');
  }

  function ico(name, size) {
    return typeof iconHtml === 'function' ? iconHtml(name, size || 18) : '';
  }

  async function openHighlightStories(profileUid, highlightId) {
    if (typeof storyCall !== 'function') return;
    try {
      const open = await storyCall('open_highlight', { targetUid: profileUid, highlightId });
      const stories = open.stories || [];
      if (stories[0] && typeof openStoryViewer === 'function') openStoryViewer(stories[0], stories);
      else if (typeof showToast === 'function') showToast('Empty highlight');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not open highlight');
    }
  }

  async function mountProfileHighlights(host, opts = {}) {
    if (!host) return;
    const profileUid = opts.uid || currentUser?.uid;
    if (!profileUid) return;
    const isOwner = !!(opts.isOwner || (currentUser && currentUser.uid === profileUid));
    host.innerHTML = `<div class="cp-hl-rail" data-hl-rail></div>`;
    const rail = host.querySelector('[data-hl-rail]');
    if (typeof renderSkeleton === 'function' && rail) renderSkeleton(rail, { variant: 'card', count: 3 });
    else if (rail) rail.innerHTML = '<span class="cp-hl-loading">Loading…</span>';
    try {
      const data = typeof storyCall === 'function' ? await storyCall('list_highlights', { targetUid: profileUid }) : { highlights: [] };
      const highlights = data.highlights || [];
      if (!rail) return;
      if (!highlights.length && !isOwner) {
        rail.innerHTML = '<span class="public-profile-highlights-empty">No highlights yet</span>';
        return;
      }
      const rings = highlights
        .map(
          (h) => `<button type="button" class="cp-hl-ring" data-highlight-id="${esc(h.id)}" title="${esc(h.title)}">
            <span class="cp-hl-ring-cover">${h.coverUrl ? `<img src="${esc(h.coverUrl)}" alt="">` : `<span class="cp-hl-ring-fallback">${ico('image', 22)}</span>`}</span>
            <small>${esc(h.title)}</small>
          </button>`
        )
        .join('');
      const addBtn = isOwner
        ? `<button type="button" class="cp-hl-ring cp-hl-add" data-hl-add aria-label="New highlight">
            <span class="cp-hl-ring-cover cp-hl-ring-cover--add">${ico('plus', 22)}</span>
            <small>New</small>
          </button>`
        : '';
      rail.innerHTML = addBtn + rings || '<span class="public-profile-highlights-empty">No highlights yet</span>';

      rail.querySelectorAll('[data-highlight-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (isOwner && (btn.dataset.longpress === '1' || opts.editable)) {
            openManageHighlightSheet(btn.dataset.highlightId, () => mountProfileHighlights(host, opts));
            return;
          }
          openHighlightStories(profileUid, btn.dataset.highlightId);
        });
        if (isOwner) {
          let t = null;
          btn.addEventListener('pointerdown', () => {
            t = setTimeout(() => {
              btn.dataset.longpress = '1';
              openManageHighlightSheet(btn.dataset.highlightId, () => mountProfileHighlights(host, opts));
            }, 480);
          });
          const clear = () => {
            clearTimeout(t);
            setTimeout(() => {
              btn.dataset.longpress = '0';
            }, 0);
          };
          btn.addEventListener('pointerup', clear);
          btn.addEventListener('pointercancel', clear);
          btn.addEventListener('pointerleave', () => clearTimeout(t));
        }
      });
      rail.querySelector('[data-hl-add]')?.addEventListener('click', () => {
        openCreateHighlightSheet(() => mountProfileHighlights(host, opts));
      });
    } catch (e) {
      if (typeof renderErrorState === 'function') {
        renderErrorState(host, {
          title: 'Highlights unavailable',
          message: typeof friendlyError === 'function' ? friendlyError(e) : 'Please try again.',
          onRetry: () => mountProfileHighlights(host, opts),
        });
      } else {
        host.innerHTML = '<span class="public-profile-highlights-empty">Highlights unavailable</span>';
      }
    }
  }

  function openCreateHighlightSheet(onDone) {
    document.getElementById('cpHlCreateSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'cpHlCreateSheet';
    sheet.className = 'archive-overlay';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">${ico('arrow-left', 20)}</button>
        <div style="flex:1"><strong>New Highlight</strong></div>
      </div>
      <div style="padding:16px;">
        <label class="story-editor-field">Title
          <input type="text" maxlength="40" data-hl-title placeholder="e.g. Travel, Wins, Favorites">
        </label>
        <button type="button" class="btn btn--primary btn--block" data-hl-create style="margin-top:16px;">Create</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-hl-create]')?.addEventListener('click', async () => {
      const title = sheet.querySelector('[data-hl-title]')?.value?.trim() || 'Highlight';
      try {
        await storyCall('create_highlight', { title });
        close();
        if (typeof showToast === 'function') showToast('Highlight created');
        if (typeof onDone === 'function') onDone();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Could not create highlight');
      }
    });
  }

  async function openManageHighlightSheet(highlightId, onDone) {
    if (!highlightId || typeof storyCall !== 'function') return;
    document.getElementById('cpHlManageSheet')?.remove();
    let list = [];
    let meta = null;
    try {
      const data = await storyCall('list_highlights', {});
      list = data.highlights || [];
      meta = list.find((h) => h.id === highlightId) || null;
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not load highlight');
      return;
    }
    if (!meta) {
      if (typeof showToast === 'function') showToast('Highlight not found');
      return;
    }
    let openData = { stories: [] };
    try {
      openData = await storyCall('open_highlight', { highlightId });
    } catch (e) {}

    const sheet = document.createElement('div');
    sheet.id = 'cpHlManageSheet';
    sheet.className = 'archive-overlay';
    sheet.setAttribute('data-nav-managed', '1');
    const stories = openData.stories || [];
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Back">${ico('arrow-left', 20)}</button>
        <div style="flex:1"><strong>${esc(meta.title)}</strong></div>
        <button type="button" data-hl-delete class="cp-danger-text" aria-label="Delete">${ico('trash', 18)}</button>
      </div>
      <div style="padding:16px;">
        <label class="story-editor-field">Title
          <input type="text" maxlength="40" data-hl-title value="${esc(meta.title)}">
        </label>
        <div style="display:flex;gap:8px;margin:12px 0;">
          <button type="button" class="btn ${meta.privacy === 'public' ? 'btn--primary' : ''}" data-hl-privacy="public" style="flex:1;">Public</button>
          <button type="button" class="btn ${meta.privacy === 'private' ? 'btn--primary' : ''}" data-hl-privacy="private" style="flex:1;">Private</button>
        </div>
        <button type="button" class="btn btn--block" data-hl-save style="margin-bottom:12px;">Save title &amp; privacy</button>
        <button type="button" class="btn btn--primary btn--block" data-hl-add-stories style="margin-bottom:16px;">${ico('plus', 16)} Add from archive</button>
        <div class="cp-hl-story-grid">${
          stories.length
            ? stories
                .map(
                  (s) => `<div class="cp-hl-story-cell" data-story-id="${esc(s.id)}" data-dest="${esc(s.destination || 'baithak')}">
                    ${s.thumb || s.media ? `<img src="${esc(s.thumb || s.media)}" alt="">` : `<span>${esc((s.text || 'Story').slice(0, 24))}</span>`}
                    <button type="button" class="cp-hl-story-remove" data-remove-story aria-label="Remove">${ico('x', 14)}</button>
                  </div>`
                )
                .join('')
            : '<div class="public-profile-posts-empty">No stories in this highlight yet</div>'
        }</div>
        <button type="button" class="btn btn--block" data-hl-view style="margin-top:14px;">View highlight</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });

    let privacy = meta.privacy === 'private' ? 'private' : 'public';
    sheet.querySelectorAll('[data-hl-privacy]').forEach((b) =>
      b.addEventListener('click', () => {
        privacy = b.dataset.hlPrivacy;
        sheet.querySelectorAll('[data-hl-privacy]').forEach((x) => x.classList.toggle('btn--primary', x === b));
      })
    );
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-hl-save]')?.addEventListener('click', async () => {
      const title = sheet.querySelector('[data-hl-title]')?.value?.trim() || meta.title;
      try {
        await storyCall('update_highlight', { highlightId, title, privacy });
        if (typeof showToast === 'function') showToast('Highlight saved');
        close();
        if (typeof onDone === 'function') onDone();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Could not save');
      }
    });
    sheet.querySelector('[data-hl-delete]')?.addEventListener('click', async () => {
      if (!confirm('Delete this highlight? Stories stay in archive.')) return;
      try {
        await storyCall('delete_highlight', { highlightId });
        close();
        if (typeof showToast === 'function') showToast('Highlight deleted');
        if (typeof onDone === 'function') onDone();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Could not delete');
      }
    });
    sheet.querySelector('[data-hl-view]')?.addEventListener('click', () => {
      close();
      openHighlightStories(currentUser.uid, highlightId);
    });
    sheet.querySelectorAll('[data-remove-story]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cell = btn.closest('[data-story-id]');
        try {
          await storyCall('remove_highlight_story', {
            highlightId,
            destination: cell.dataset.dest,
            storyId: cell.dataset.storyId,
          });
          cell.remove();
          if (typeof showToast === 'function') showToast('Removed');
        } catch (err) {
          if (typeof showToast === 'function') showToast('Could not remove');
        }
      });
    });
    sheet.querySelector('[data-hl-add-stories]')?.addEventListener('click', () => {
      openPickStoriesForHighlight(highlightId, () => {
        close();
        openManageHighlightSheet(highlightId, onDone);
      });
    });
  }

  async function openPickStoriesForHighlight(highlightId, onDone) {
    document.getElementById('cpHlPickSheet')?.remove();
    let stories = [];
    try {
      const archived = await storyCall('archive', {});
      stories = archived.stories || [];
    } catch (e) {
      if (typeof showToast === 'function') showToast('Archive unavailable');
      return;
    }
    const sheet = document.createElement('div');
    sheet.id = 'cpHlPickSheet';
    sheet.className = 'archive-overlay';
    sheet.setAttribute('data-nav-managed', '1');
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss>${ico('arrow-left', 20)}</button>
        <div style="flex:1"><strong>Add stories</strong></div>
        <button type="button" class="btn btn--primary" data-hl-pick-done>Done</button>
      </div>
      <div class="cp-hl-pick-grid" style="padding:12px;">
        ${
          stories.length
            ? stories
                .slice(0, 60)
                .map(
                  (s) => `<button type="button" class="cp-hl-pick-cell" data-story-id="${esc(s.id)}" data-dest="${esc(s.destination || 'baithak')}">
                    ${s.thumb || s.media ? `<img src="${esc(s.thumb || s.media)}" alt="">` : `<span>${esc((s.text || 'Story').slice(0, 20))}</span>`}
                  </button>`
                )
                .join('')
            : '<div class="public-profile-posts-empty">No archive stories yet</div>'
        }
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    const selected = new Set();
    sheet.querySelectorAll('[data-story-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = `${btn.dataset.dest}:${btn.dataset.storyId}`;
        if (selected.has(key)) {
          selected.delete(key);
          btn.classList.remove('is-selected');
        } else {
          selected.add(key);
          btn.classList.add('is-selected');
        }
      });
    });
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-hl-pick-done]')?.addEventListener('click', async () => {
      for (const key of selected) {
        const [destination, storyId] = key.split(':');
        try {
          await storyCall('add_highlight_story', { highlightId, destination, storyId });
        } catch (e) {}
      }
      close();
      if (typeof showToast === 'function') showToast(selected.size ? 'Stories added' : 'Nothing selected');
      if (typeof onDone === 'function') onDone();
    });
  }

  window.mountProfileHighlights = mountProfileHighlights;
  window.openCreateHighlightSheet = openCreateHighlightSheet;
  window.openManageHighlightSheet = openManageHighlightSheet;
  window.openHighlightStories = openHighlightStories;
})();
