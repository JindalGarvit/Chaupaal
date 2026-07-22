/**
 * Archive Hub — Stories, Duniya/Lehar, Peepal in clearly separated sections.
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

  function openArchiveHub(initialTab) {
    document.getElementById('archiveHubSheet')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'archiveHubSheet';
    overlay.className = 'archive-overlay';
    overlay.setAttribute('data-nav-managed', '1');
    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" data-archive-hub-back aria-label="Back">←</button>
        <div style="flex:1">
          <strong>Archive</strong>
          <div class="relationship-private-note">Everything you’ve posted — archived items stay private to you</div>
        </div>
      </div>
      <div class="archive-hub-tabs">
        <button type="button" data-ah-tab="stories" class="active">Stories</button>
        <button type="button" data-ah-tab="duniya">Duniya / Lehar</button>
        <button type="button" data-ah-tab="peepal">Peepal</button>
        <button type="button" data-ah-tab="journal">Journal</button>
      </div>
      <div class="archive-hub-body" data-ah-body>Loading…</div>`;
    document.querySelector('.device')?.appendChild(overlay);
    if (typeof pushNavLayer === 'function') {
      pushNavLayer(overlay, { onPop: () => overlay.remove() });
    }
    overlay.querySelector('[data-archive-hub-back]')?.addEventListener('click', () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      else overlay.remove();
    });

    const body = overlay.querySelector('[data-ah-body]');
    const setTab = async (tab) => {
      overlay.querySelectorAll('[data-ah-tab]').forEach((b) => b.classList.toggle('active', b.dataset.ahTab === tab));

      if (tab === 'journal') {
        body.innerHTML = `<div class="archive-hub-copy">Private journal — never visible on your public profile.</div><div data-ah-journal>Loading…</div>`;
        if (!db || !currentUser) return;
        try {
          const snap = await db
            .collection('daily_checkins')
            .where('uid', '==', currentUser.uid)
            .limit(60)
            .get();
          const entries = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
          const host = body.querySelector('[data-ah-journal]');
          host.innerHTML = entries.length
            ? entries
                .map(
                  (e) =>
                    `<div class="archive-journal-row"><strong>${(e.date || '').slice(0, 10) || 'Entry'}</strong><p>${String(e.text || '').slice(0, 180)}</p></div>`
                )
                .join('')
            : '<div class="comments-empty">No journal entries yet</div>';
        } catch (e) {
          body.querySelector('[data-ah-journal]').innerHTML = '<div class="comments-empty">Could not load journal</div>';
        }
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
                    `<div class="archive-highlight-row"><strong>${h.title}</strong><span>${h.storyCount} stories</span></div>`
                )
                .join('')
            : '<div class="comments-empty">No Highlights yet</div>';
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
      initialTab === 'posts' || initialTab === 'preview' ? 'duniya' : initialTab || 'stories';
    setTab(initial);
  }

  window.openArchiveHub = openArchiveHub;
  window.setPostArchived = setPostArchived;
  window.openArchive = function () {
    openArchiveHub('duniya');
  };
})();
