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
        <button type="button" data-ah-tab="interactions">Interactions</button>
        <button type="button" data-ah-tab="journal">Journal</button>
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
        body.innerHTML = `<div class="archive-hub-copy">Private journal — never visible on your public profile.</div>
          <div class="archive-journal-compose">
            <textarea data-ah-journal-input placeholder="Quick capture — how are you today?" rows="3"></textarea>
            <label class="archive-journal-consent"><input type="checkbox" data-ah-journal-ai> Allow soft analysis for personal insights (optional)</label>
            <button type="button" class="btn btn--primary" data-ah-journal-save>Save entry</button>
          </div>
          <div data-ah-journal>Loading…</div>`;
        if (!db || !currentUser) return;
        const saveBtn = body.querySelector('[data-ah-journal-save]');
        saveBtn?.addEventListener('click', async () => {
          const text = String(body.querySelector('[data-ah-journal-input]')?.value || '').trim();
          if (!text) {
            if (typeof showToast === 'function') showToast('Write something first');
            return;
          }
          const allowAi = !!body.querySelector('[data-ah-journal-ai]')?.checked;
          const date = new Date().toISOString().slice(0, 10);
          try {
            const col = db.collection('users').doc(currentUser.uid).collection('journal');
            await col.add({
              text: text.slice(0, 4000),
              date,
              allowAnalysis: allowAi,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            if (allowAi && typeof callAI === 'function') {
              try {
                const hint = typeof teenAiSystemHint === 'function' ? teenAiSystemHint() : '';
                await callAI({
                  tier: 'fast',
                  max_tokens: 120,
                  feature: 'journal_analysis',
                  system:
                    'You summarize a private journal entry into 1 warm sentence of personal insight. No diagnosis.' +
                    hint,
                  messages: [{ role: 'user', content: text.slice(0, 800) }],
                });
              } catch (e) {}
            }
            if (typeof showToast === 'function') showToast('Saved to journal');
            body.querySelector('[data-ah-journal-input]').value = '';
            setTab('journal');
          } catch (e) {
            if (typeof showToast === 'function') showToast('Could not save');
          }
        });
        try {
          const snap = await db
            .collection('users')
            .doc(currentUser.uid)
            .collection('journal')
            .limit(60)
            .get();
          const entries = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
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
          : initialTab || 'stories';
    setTab(initial);
  }

  window.openArchiveHub = openArchiveHub;
  window.setPostArchived = setPostArchived;
  window.openArchive = function () {
    openArchiveHub('duniya');
  };
})();
