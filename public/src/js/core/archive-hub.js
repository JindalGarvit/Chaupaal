/**
 * Archive Hub (Section 6) — owner controls for posts + story highlights + private journal.
 *
 * Defaults (inverted):
 * - Stories: archived after 24h expiry; Highlights opt them onto the profile.
 * - Duniya/Peepal posts: visible by default; archived:true hides from visitors.
 * - Journal: always private (Firestore daily_checkins rules).
 * - Archive categories: folder system for posts — separate from story Highlights.
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

  async function loadJournalEntries() {
    if (!db || !currentUser) return [];
    try {
      const snap = await db
        .collection('daily_checkins')
        .where('uid', '==', currentUser.uid)
        .limit(60)
        .get();
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    } catch (e) {
      return [];
    }
  }

  function openArchiveHub(initialTab) {
    document.getElementById('archiveHubSheet')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'archiveHubSheet';
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" data-archive-hub-back aria-label="Back">←</button>
        <div style="flex:1">
          <strong>Archive Hub</strong>
          <div class="relationship-private-note">Stories hide when they expire · Posts stay public until you archive them · Journal is only yours</div>
        </div>
      </div>
      <div class="archive-hub-tabs">
        <button type="button" data-ah-tab="posts" class="active">Your posts</button>
        <button type="button" data-ah-tab="stories">Story Highlights</button>
        <button type="button" data-ah-tab="journal">Private journal</button>
        <button type="button" data-ah-tab="preview">Visitor preview</button>
      </div>
      <div class="archive-hub-body" data-ah-body>Loading…</div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('[data-archive-hub-back]')?.addEventListener('click', () => overlay.remove());

    const body = overlay.querySelector('[data-ah-body]');
    const setTab = async (tab) => {
      overlay.querySelectorAll('[data-ah-tab]').forEach((b) => b.classList.toggle('active', b.dataset.ahTab === tab));
      if (tab === 'preview') {
        body.innerHTML = `<div class="archive-hub-copy">Preview shows your profile the way a visitor sees it — archived posts hidden, only Highlights for expired stories.</div>
          <button type="button" class="btn btn--primary" data-ah-preview>Open preview</button>`;
        body.querySelector('[data-ah-preview]')?.addEventListener('click', () => {
          overlay.remove();
          if (typeof setProfilePreviewMode === 'function') setProfilePreviewMode(true);
          document.getElementById('profileModal')?.classList.remove('hidden');
          if (typeof renderProfileModal === 'function') renderProfileModal();
        });
        return;
      }
      if (tab === 'journal') {
        body.innerHTML = `<div class="archive-hub-copy">Private journal — never visible on your public profile. Entries sync from daily check-ins.</div><div data-ah-journal>Loading…</div>`;
        const entries = await loadJournalEntries();
        const host = body.querySelector('[data-ah-journal]');
        if (!entries.length) {
          host.innerHTML = '<div class="comments-empty">No journal entries yet. Write from your evening check-in.</div>';
          return;
        }
        host.innerHTML = entries
          .map(
            (e) => `<div class="archive-journal-row"><strong>${(e.date || '').slice(0, 10) || 'Entry'}</strong><p>${String(e.text || '').slice(0, 180)}</p></div>`
          )
          .join('');
        return;
      }
      if (tab === 'stories') {
        body.innerHTML = `<div class="archive-hub-copy">Expired stories are archived by default. Add them to a Highlight to show on your profile.</div>
          <div class="archive-hub-actions"><button type="button" class="btn" data-ah-new-highlight>New Highlight</button>
          <button type="button" class="btn" data-ah-story-archive>Open story archive</button></div>
          <div data-ah-highlights>Loading…</div>`;
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
            : '<div class="comments-empty">No Highlights yet — create one, then add stories from Story Archive.</div>';
        } catch (e) {
          body.querySelector('[data-ah-highlights]').innerHTML = '<div class="comments-empty">Could not load highlights</div>';
        }
        return;
      }

      // posts tab
      body.innerHTML = `<div class="archive-hub-copy">Duniya & Peepal posts stay visible until you archive them. Archived posts leave your public profile but stay here.</div>
        <div data-ah-posts>Loading…</div>`;
      const [duniya, peepal] = await Promise.all([loadOwnerPosts('duniya'), loadOwnerPosts('peepal')]);
      const host = body.querySelector('[data-ah-posts]');
      const row = (p, collection) => {
        const archived = p.archived === true;
        const label = collection === 'duniya' ? 'Duniya' : 'Peepal';
        const title = collection === 'duniya' ? (p.caption || 'Post').slice(0, 60) : (p.question || 'Question').slice(0, 60);
        return `<div class="archive-post-row" data-id="${p.id}" data-col="${collection}">
          <div><strong>${label}</strong><p>${title}</p><small>${archived ? 'Archived — hidden from visitors' : 'Live on profile'}</small></div>
          <button type="button" data-toggle-archive="${archived ? '0' : '1'}">${archived ? 'Unarchive' : 'Archive'}</button>
        </div>`;
      };
      host.innerHTML = [...duniya.map((p) => row(p, 'duniya')), ...peepal.map((p) => row(p, 'peepal'))].join('') ||
        '<div class="comments-empty">No posts yet</div>';
      host.querySelectorAll('[data-toggle-archive]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rowEl = btn.closest('.archive-post-row');
          const archived = btn.dataset.toggleArchive === '1';
          try {
            await setPostArchived(rowEl.dataset.col, rowEl.dataset.id, archived);
            if (typeof showToast === 'function') showToast(archived ? 'Archived' : 'Unarchived');
            setTab('posts');
          } catch (e) {
            if (typeof showToast === 'function') showToast('Could not update');
          }
        });
      });
    };

    overlay.querySelectorAll('[data-ah-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.ahTab));
    });
    setTab(initialTab || 'posts');
  }

  // Prefer Archive Hub over legacy localStorage archive UI
  window.openArchiveHub = openArchiveHub;
  window.openArchive = function () {
    openArchiveHub('posts');
  };
})();
