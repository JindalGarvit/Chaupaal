/**
 * Archive Hub — Journal first, then Stories, Duniya/Lehar, Peepal, Interactions.
 * Owner sees archived + live; visitors never see archived (filtered on profile).
 */
(function () {
  'use strict';

  async function setPostArchived(collection, postId, archived) {
    if (!db || !currentUser || !postId) return;
    await db
      .collection(collection)
      .doc(postId)
      .update({
        archived: !!archived,
        archivedAt: archived ? firebase.firestore.FieldValue.serverTimestamp() : null,
      });
  }

  async function loadOwnerPosts(collection) {
    if (!db || !currentUser) return [];
    const snap = await db.collection(collection).where('uid', '==', currentUser.uid).limit(80).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
  }

  function postRow(p, collection) {
    const archived = p.archived === true;
    const label = collection === 'duniya' ? 'Duniya' : 'Peepal';
    const title =
      collection === 'duniya' ? (p.caption || 'Post').slice(0, 80) : (p.question || 'Question').slice(0, 80);
    const thumb = p.thumb || p.media || '';
    return `<div class="archive-post-row" data-id="${p.id}" data-col="${collection}">
      ${thumb ? `<img class="archive-thumb" src="${thumb}" alt="">` : '<div class="archive-thumb archive-thumb--empty">◇</div>'}
      <div class="archive-post-meta">
        <strong>${label}</strong>
        <p>${title}</p>
        <small class="${archived ? 'is-archived' : ''}">${archived ? 'Archived — only you can see this' : 'Live on profile'}</small>
      </div>
      <button type="button" class="btn" data-toggle-archive="${archived ? '0' : '1'}">${archived ? 'Unarchive' : 'Archive'}</button>
    </div>`;
  }

  function wireArchiveToggles(host, onDone) {
    host.querySelectorAll('[data-toggle-archive]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rowEl = btn.closest('.archive-post-row');
        const archived = btn.dataset.toggleArchive === '1';
        try {
          await setPostArchived(rowEl.dataset.col, rowEl.dataset.id, archived);
          if (typeof showToast === 'function') showToast(archived ? 'Archived' : 'Unarchived');
          if (typeof onDone === 'function') onDone();
        } catch (e) {
          if (typeof showToast === 'function') showToast('Could not update');
        }
      });
    });
  }

  function jc() {
    return typeof JournalCheckIn !== 'undefined' ? JournalCheckIn : null;
  }

  function ico(name, size) {
    return typeof iconHtml === 'function' ? iconHtml(name, { size: size || 16 }) : '';
  }

  function esc(s) {
    return typeof escapeHtmlText === 'function'
      ? escapeHtmlText(s)
      : String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');
  }

  function renderJournalComposeHtml() {
    const prompt =
      jc()?.pickPrompt?.(jc()?.journalWindow?.() || 'anytime') || 'What’s sitting with you right now?';
    return `<div class="archive-journal-compose" data-ah-journal-compose>
      <p class="journal-checkin-prompt">${esc(prompt)}</p>
      <div class="journal-compose-wrap">
        <textarea data-ah-journal-input rows="3" maxlength="4000" placeholder="Write freely — only you can see this"></textarea>
        <button type="button" class="journal-compose-mic" data-ah-journal-mic aria-label="Voice typing">${ico('mic', 20)}</button>
      </div>
      <label class="archive-journal-consent journal-analysis-consent">
        <input type="checkbox" data-ah-journal-ai checked>
        Allow soft analysis for personal insights (optional)
      </label>
      <button type="button" class="btn btn--primary" data-ah-journal-save>Save entry</button>
    </div>`;
  }

  function journalRowHtml(e) {
    const api = jc();
    const ms = api?.entryCreatedMs?.(e) || 0;
    const collapsedDate = api?.formatCollapsedDate?.(ms, e.date) || String(e.date || '').slice(0, 10) || 'Entry';
    const expandedDate = api?.formatExpandedDate?.(ms, e.date) || collapsedDate;
    const expandedTime = api?.formatExpandedTime?.(ms) || '';
    const canEdit = api?.canEditEntry?.(e);
    const text = String(e.text || '');
    return `<div class="archive-journal-row" data-journal-id="${esc(e.id)}" data-expanded="0">
      <div class="archive-journal-row-main" data-journal-toggle>
        <div class="archive-journal-dates">
          <strong class="archive-journal-date" data-date-collapsed>${esc(collapsedDate)}</strong>
          <strong class="archive-journal-date archive-journal-date--expanded" data-date-expanded hidden>${esc(expandedDate)}</strong>
          ${expandedTime ? `<small class="archive-journal-time" data-time-expanded hidden>${esc(expandedTime)}</small>` : ''}
        </div>
        <p class="archive-journal-body" data-journal-body>${esc(text)}</p>
      </div>
      <div class="archive-journal-row-actions">
        ${
          canEdit
            ? `<button type="button" class="archive-journal-edit" data-journal-edit aria-label="Edit">${ico('pen', 16)}</button>`
            : ''
        }
      </div>
      <div class="archive-journal-edit-panel" data-journal-edit-panel hidden>
        <div class="journal-compose-wrap">
          <textarea data-journal-edit-text rows="3" maxlength="4000">${esc(text)}</textarea>
          <button type="button" class="journal-compose-mic" data-journal-edit-mic aria-label="Voice typing">${ico('mic', 20)}</button>
        </div>
        <label class="archive-journal-consent">
          <input type="checkbox" data-journal-edit-ai checked>
          Allow soft analysis for personal insights (optional)
        </label>
        <div class="archive-journal-edit-actions">
          <button type="button" class="btn btn--primary" data-journal-edit-save>Save changes</button>
          <button type="button" class="btn" data-journal-edit-cancel>Cancel</button>
        </div>
      </div>
    </div>`;
  }

  async function renderJournalTab(body, setTab) {
    body.innerHTML = `<div class="archive-hub-copy">Private journal — never visible on your public profile.</div>
      ${renderJournalComposeHtml()}
      <div data-ah-journal>Loading…</div>`;
    if (!db || !currentUser) {
      body.querySelector('[data-ah-journal]').innerHTML = '<div class="comments-empty">Sign in to journal</div>';
      return;
    }

    const compose = body.querySelector('[data-ah-journal-compose]');
    const ta = compose?.querySelector('[data-ah-journal-input]');
    const mic = compose?.querySelector('[data-ah-journal-mic]');
    const aiBox = compose?.querySelector('[data-ah-journal-ai]');
    if (aiBox) aiBox.checked = true;
    if (jc()?.wireMicForTextarea) jc().wireMicForTextarea(ta, mic);
    else if (typeof JournalCheckIn?.wireMicForTextarea === 'function') {
      JournalCheckIn.wireMicForTextarea(ta, mic);
    }

    compose?.querySelector('[data-ah-journal-save]')?.addEventListener('click', async () => {
      const text = String(ta?.value || '');
      const allowAi = !!aiBox?.checked;
      try {
        if (jc()?.save) {
          await jc().save({ text, allowAnalysis: allowAi });
        } else if (typeof JournalCheckIn?.save === 'function') {
          await JournalCheckIn.save({ text, allowAnalysis: allowAi });
        } else {
          throw new Error('NO_SAVE');
        }
        if (typeof showToast === 'function') showToast('Saved to journal');
        if (ta) ta.value = '';
        ta?.dispatchEvent(new Event('input', { bubbles: true }));
        if (aiBox) aiBox.checked = true;
        setTab('journal');
      } catch (e) {
        const msg =
          e?.message === 'EMPTY'
            ? 'Write something first'
            : e?.message === 'CAP'
              ? 'Journal is full for now'
              : 'Could not save';
        if (typeof showToast === 'function') showToast(msg);
      }
    });

    const host = body.querySelector('[data-ah-journal]');
    try {
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('journal')
        .limit(120)
        .get();
      const entries = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const am = jc()?.entryCreatedMs?.(a) || 0;
          const bm = jc()?.entryCreatedMs?.(b) || 0;
          if (bm !== am) return bm - am;
          return String(b.date || '').localeCompare(String(a.date || ''));
        });
      host.innerHTML = entries.length
        ? entries.map((e) => journalRowHtml(e)).join('')
        : '<div class="comments-empty">No journal entries yet</div>';

      host.querySelectorAll('.archive-journal-row').forEach((row) => {
        const toggle = row.querySelector('[data-journal-toggle]');
        const editBtn = row.querySelector('[data-journal-edit]');
        const editPanel = row.querySelector('[data-journal-edit-panel]');
        const bodyEl = row.querySelector('[data-journal-body]');
        const dateCollapsed = row.querySelector('[data-date-collapsed]');
        const dateExpanded = row.querySelector('[data-date-expanded]');
        const timeExpanded = row.querySelector('[data-time-expanded]');

        const setExpanded = (on) => {
          row.dataset.expanded = on ? '1' : '0';
          row.classList.toggle('is-expanded', on);
          if (dateCollapsed) dateCollapsed.hidden = !!on;
          if (dateExpanded) dateExpanded.hidden = !on;
          if (timeExpanded) timeExpanded.hidden = !on;
          if (bodyEl) bodyEl.classList.toggle('is-clamped', !on);
        };
        setExpanded(false);

        toggle?.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-journal-edit]') || !editPanel?.hidden) return;
          setExpanded(row.dataset.expanded !== '1');
        });

        editBtn?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          editPanel.hidden = false;
          editBtn.hidden = true;
          setExpanded(true);
          const editTa = editPanel.querySelector('[data-journal-edit-text]');
          const editMic = editPanel.querySelector('[data-journal-edit-mic]');
          const editAi = editPanel.querySelector('[data-journal-edit-ai]');
          if (editAi) editAi.checked = true;
          if (jc()?.wireMicForTextarea) jc().wireMicForTextarea(editTa, editMic);
          editTa?.focus();
        });

        editPanel?.querySelector('[data-journal-edit-cancel]')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          editPanel.hidden = true;
          if (editBtn) editBtn.hidden = false;
        });

        editPanel?.querySelector('[data-journal-edit-save]')?.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const text = editPanel.querySelector('[data-journal-edit-text]')?.value || '';
          const allowAi = !!editPanel.querySelector('[data-journal-edit-ai]')?.checked;
          try {
            if (jc()?.save) {
              await jc().save({
                text,
                allowAnalysis: allowAi,
                entryId: row.dataset.journalId,
              });
            } else {
              throw new Error('NO_SAVE');
            }
            if (typeof showToast === 'function') showToast('Updated');
            setTab('journal');
          } catch (e) {
            if (typeof showToast === 'function') {
              showToast(e?.message === 'EMPTY' ? 'Write something first' : 'Could not save');
            }
          }
        });
      });
    } catch (e) {
      host.innerHTML = '<div class="comments-empty">Could not load journal</div>';
    }
  }

  function openArchiveHub(initialTab) {
    document.getElementById('archiveHubSheet')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'archiveHubSheet';
    overlay.className = 'archive-overlay';
    overlay.setAttribute('data-nav-managed', '1');
    overlay.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-archive-hub-back' }):'<button type="button" data-archive-hub-back class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1">
          <strong>Archive</strong>
          <div class="relationship-private-note">Everything you’ve posted — archived items stay private to you</div>
        </div>
      </div>
      <div class="archive-hub-tabs">
        <button type="button" data-ah-tab="journal" class="active">Journal</button>
        <button type="button" data-ah-tab="stories">Stories</button>
        <button type="button" data-ah-tab="duniya">Duniya / Lehar</button>
        <button type="button" data-ah-tab="peepal">Peepal</button>
        <button type="button" data-ah-tab="interactions">Interactions</button>
      </div>
      <div class="archive-hub-body" data-ah-body>Loading…</div>`;
    document.querySelector('.device')?.appendChild(overlay);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      if (overlay.isConnected) overlay.remove();
    };
    if (typeof openLayer === 'function') openLayer(overlay, close, { remove: false, label: 'Archive' });
    else if (typeof pushNavLayer === 'function') {
      overlay.dataset.navManaged = '1';
      pushNavLayer(overlay, close);
    }
    overlay.querySelector('[data-archive-hub-back]')?.addEventListener('click', close);

    const body = overlay.querySelector('[data-ah-body]');
    const setTab = async (tab) => {
      overlay.querySelectorAll('[data-ah-tab]').forEach((b) => b.classList.toggle('active', b.dataset.ahTab === tab));

      if (tab === 'journal') {
        await renderJournalTab(body, setTab);
        return;
      }

      if (tab === 'interactions') {
        body.innerHTML = `<div class="archive-hub-copy">Likes, comments, and saves — your activity across Chaupaal.</div>
          <div class="archive-hub-tabs archive-hub-tabs--sub">
            <button type="button" data-ah-ix="saved" class="active">Saved</button>
            <button type="button" data-ah-ix="likes">Likes</button>
            <button type="button" data-ah-ix="comments">Comments</button>
          </div>
          <div data-ah-ix-body>Loading…</div>`;
        const ixBody = body.querySelector('[data-ah-ix-body]');
        const loadIx = async (kind) => {
          body.querySelectorAll('[data-ah-ix]').forEach((b) => b.classList.toggle('active', b.dataset.ahIx === kind));
          if (!db || !currentUser) {
            ixBody.innerHTML = '<div class="comments-empty">Sign in to see interactions</div>';
            return;
          }
          ixBody.innerHTML = 'Loading…';
          try {
            if (kind === 'saved') {
              const snap = await db
                .collection('users')
                .doc(currentUser.uid)
                .collection('saved')
                .orderBy('savedAt', 'desc')
                .limit(50)
                .get()
                .catch(() =>
                  db.collection('users').doc(currentUser.uid).collection('saved').limit(50).get()
                );
              const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              ixBody.innerHTML = rows.length
                ? rows
                    .map(
                      (r) =>
                        `<div class="archive-post-row"><div class="archive-post-meta"><strong>${r.collection || 'post'}</strong><p>${String(r.preview || r.postId || '').slice(0, 100)}</p><small>Saved</small></div></div>`
                    )
                    .join('')
                : '<div class="comments-empty">No saved posts yet — tap the bookmark on Duniya or Peepal</div>';
              return;
            }
            if (kind === 'likes') {
              const snap = await db
                .collection('users')
                .doc(currentUser.uid)
                .collection('likes')
                .limit(40)
                .get()
                .catch(() => null);
              const rows = snap?.docs?.map((d) => ({ id: d.id, ...d.data() })) || [];
              ixBody.innerHTML = rows.length
                ? rows
                    .map(
                      (r) =>
                        `<div class="archive-post-row"><div class="archive-post-meta"><strong>${r.collection || 'like'}</strong><p>${String(r.preview || r.postId || '').slice(0, 100)}</p></div></div>`
                    )
                    .join('')
                : '<div class="comments-empty">Liked posts will show here</div>';
              return;
            }
            // comments
            const snap = await db
              .collection('users')
              .doc(currentUser.uid)
              .collection('comment_activity')
              .limit(40)
              .get()
              .catch(() => null);
            const rows = snap?.docs?.map((d) => ({ id: d.id, ...d.data() })) || [];
            ixBody.innerHTML = rows.length
              ? rows
                  .map(
                    (r) =>
                      `<div class="archive-post-row"><div class="archive-post-meta"><strong>${r.collection || 'comment'}</strong><p>${String(r.text || r.preview || '').slice(0, 120)}</p></div></div>`
                  )
                  .join('')
              : '<div class="comments-empty">Your comments will gather here</div>';
          } catch (e) {
            ixBody.innerHTML = '<div class="comments-empty">Could not load interactions</div>';
          }
        };
        body.querySelectorAll('[data-ah-ix]').forEach((btn) => {
          btn.addEventListener('click', () => loadIx(btn.dataset.ahIx));
        });
        loadIx('saved');
        return;
      }

      if (tab === 'stories') {
        body.innerHTML = `<div class="archive-hub-copy">Stories archive by default after expiry. Save-without-posting items land here immediately. Add to a Highlight to show on your profile.</div>
          <div class="archive-hub-actions">
            <button type="button" class="btn" data-ah-new-highlight>New Highlight</button>
            <button type="button" class="btn btn--primary" data-ah-story-archive>Open story archive</button>
          </div>
          <div data-ah-highlights>Loading…</div>
          <div data-ah-story-list style="margin-top:14px;"></div>`;
        body.querySelector('[data-ah-story-archive]')?.addEventListener('click', () => {
          if (typeof openStoryArchive === 'function') openStoryArchive();
        });
        body.querySelector('[data-ah-new-highlight]')?.addEventListener('click', async () => {
          const title =
            typeof promptNameSheet === 'function'
              ? await promptNameSheet({
                  title: 'New Highlight',
                  placeholder: 'e.g. Travel, Wins, Favorites',
                  confirmLabel: 'Create',
                })
              : null;
          if (!title || typeof storyCall !== 'function') return;
          try {
            await storyCall('create_highlight', { title });
            if (typeof showToast === 'function') showToast('Highlight created');
            setTab('stories');
          } catch (e) {
            if (typeof showToast === 'function') showToast('Could not create highlight');
          }
        });
        try {
          const data = typeof storyCall === 'function' ? await storyCall('list_highlights', {}) : { highlights: [] };
          const host = body.querySelector('[data-ah-highlights]');
          const list = data.highlights || [];
          host.innerHTML = list.length
            ? list
                .map(
                  (h) =>
                    `<button type="button" class="archive-highlight-row" data-manage-hl="${h.id}" style="width:100%;text-align:left;cursor:pointer;"><strong>${h.title}</strong><span>${h.storyCount} stories · Edit</span></button>`
                )
                .join('')
            : '<div class="comments-empty">No Highlights yet</div>';
          host.querySelectorAll('[data-manage-hl]').forEach((btn) => {
            btn.addEventListener('click', () => {
              if (typeof openManageHighlightSheet === 'function') {
                openManageHighlightSheet(btn.dataset.manageHl, () => setTab('stories'));
              }
            });
          });
        } catch (e) {
          body.querySelector('[data-ah-highlights]').innerHTML = '<div class="comments-empty">Could not load highlights</div>';
        }
        try {
          const archived =
            typeof storyCall === 'function' ? await storyCall('archive', {}) : { stories: [] };
          const stories = archived.stories || [];
          const listHost = body.querySelector('[data-ah-story-list]');
          listHost.innerHTML = stories.length
            ? `<div class="archive-hub-copy" style="margin-bottom:8px;">All stories (${stories.length})</div>` +
              stories
                .slice(0, 40)
                .map((s) => {
                  const mark = s.archived || s.saveOnly || !s.active ? 'Archived' : 'Live';
                  return `<div class="archive-post-row"><div class="archive-post-meta"><strong>${s.destination || 'story'}</strong><p>${(s.text || 'Story').slice(0, 60)}</p><small>${mark}</small></div></div>`;
                })
                .join('')
            : '<div class="comments-empty">No stories in archive yet</div>';
        } catch (e) {
          /* optional */
        }
        return;
      }

      if (tab === 'duniya' || tab === 'peepal') {
        const col = tab;
        body.innerHTML = `<div class="archive-hub-copy">${
          col === 'duniya'
            ? 'Duniya / Lehar posts — archive hides them from visitors.'
            : 'Peepal posts — archive hides them from visitors.'
        }</div><div data-ah-posts>Loading…</div>`;
        const posts = await loadOwnerPosts(col);
        const host = body.querySelector('[data-ah-posts]');
        host.innerHTML = posts.map((p) => postRow(p, col)).join('') || '<div class="comments-empty">No posts yet</div>';
        wireArchiveToggles(host, () => setTab(tab));
        return;
      }
    };

    overlay.querySelectorAll('[data-ah-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.ahTab));
    });
    const initial =
      initialTab === 'posts' || initialTab === 'preview'
        ? 'duniya'
        : initialTab === 'saved'
          ? 'interactions'
          : initialTab || 'journal';
    setTab(initial);
  }

  window.openArchiveHub = openArchiveHub;
  window.setPostArchived = setPostArchived;
  window.openArchive = function () {
    openArchiveHub('journal');
  };
})();
