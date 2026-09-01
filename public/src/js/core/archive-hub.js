/**
 * Archive Hub — canonical private archive for the signed-in owner.
 *
 * Entry points (all call openArchiveHub):
 *   Settings (#settingsArchiveBtn) → journal
 *   Profile / preview Archive buttons → duniya (posts)
 *   Baithak self-chat → journal
 *   Chaupaal hub → journal / interactions
 *
 * Tab map: journal | stories | duniya (Posts) | peepal (Discuss) | interactions (Activity) | deleted
 * Do not duplicate Archive UI elsewhere — use this module only.
 */
(function () {
  'use strict';

  const TAB_SESSION_KEY = 'chaupaal_archive_tab';
  const TAB_IDS = ['journal', 'stories', 'duniya', 'peepal', 'interactions', 'deleted'];

  function ahT(key, fallback, vars) {
    if (typeof t === 'function') {
      const out = t(key, vars || fallback);
      if (out && out !== key) return out;
    }
    let str = fallback || key;
    Object.entries(vars || {}).forEach(([k, v]) => {
      str = String(str).replace(`{{${k}}}`, v);
    });
    return str;
  }

  function normalizeTab(raw) {
    const map = {
      posts: 'duniya',
      preview: 'duniya',
      discuss: 'peepal',
      activity: 'interactions',
      saved: 'interactions',
    };
    const mapped = map[raw] || raw;
    if (TAB_IDS.includes(mapped)) return mapped;
    try {
      const saved = sessionStorage.getItem(TAB_SESSION_KEY);
      if (saved && TAB_IDS.includes(saved)) return saved;
    } catch (e) {}
    return 'journal';
  }

  function tabLabel(id) {
    const labels = {
      journal: ahT('archive_tab_journal', 'Journal'),
      stories: ahT('archive_tab_stories', 'Stories'),
      duniya: ahT('archive_tab_posts', 'Posts'),
      peepal: ahT('archive_tab_discuss', 'Discuss'),
      interactions: ahT('archive_tab_activity', 'Activity'),
      deleted: ahT('archive_tab_deleted', 'Deleted'),
    };
    return labels[id] || id;
  }

  function matchesSearch(q, text) {
    if (!q) return true;
    return String(text || '')
      .toLowerCase()
      .includes(q);
  }

  function isLeharPost(p) {
    return !!(p?.format === 'lehar' || p?.isLehar || p?.feedMode === 'lehar' || p?.lehar);
  }

  function duniyaThumb(p) {
    return (
      p?.thumb ||
      p?.media ||
      p?.slides?.[0]?.media ||
      p?.slides?.[0]?.thumb ||
      p?.attachment?.thumb ||
      p?.attachment?.data ||
      ''
    );
  }

  function renderGuestGate(host) {
    host.innerHTML = `<div class="archive-guest-gate">
      <p>${ahT('archive_sign_in', 'Sign in to view your Archive — journal, posts, stories, and activity are private to you.')}</p>
      <button type="button" class="btn btn--primary" data-ah-sign-in>${ahT('auth_sign_in_short', 'Sign in')}</button>
    </div>`;
    host.querySelector('[data-ah-sign-in]')?.addEventListener('click', () => {
      if (typeof showAuth === 'function') showAuth();
      else if (typeof requireSignIn === 'function') requireSignIn(ahT('auth_sign_in_short', 'Sign in'));
    });
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

  async function setPostArchived(collection, postId, archived) {
    if (!db || !currentUser || !postId) return;
    await db
      .collection(collection)
      .doc(postId)
      .update({
        archived: !!archived,
        archivedAt: archived ? firebase.firestore.FieldValue.serverTimestamp() : null,
      });
    try {
      document.dispatchEvent(new CustomEvent('chaupaal:profile-posts-changed'));
    } catch (e) {}
  }

  async function loadOwnerPosts(collection) {
    if (!db || !currentUser) return [];
    const snap = await db.collection(collection).where('uid', '==', currentUser.uid).limit(80).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
  }

  async function openPostFromArchive(collection, postId) {
    if (!db || !postId) return;
    try {
      const doc = await db.collection(collection).doc(postId).get();
      if (!doc.exists) {
        if (typeof showToast === 'function') showToast('Post not found');
        return;
      }
      const raw = { id: doc.id, ...doc.data() };
      if (collection === 'duniya') {
        const post =
          typeof mapDuniyaDoc === 'function' ? mapDuniyaDoc(raw) : { ...raw, firestoreId: doc.id };
        if (typeof openDuniyaDetail === 'function') {
          openDuniyaDetail(post);
          stackDetailNav(document.getElementById('duniyaPostDetail'));
        }
      } else {
        const post = typeof mapPeepalDoc === 'function' ? mapPeepalDoc(raw) : { ...raw, firestoreId: doc.id };
        if (typeof openPeepalDetail === 'function') {
          openPeepalDetail(post);
          stackDetailNav(document.getElementById('peepalDetail'));
        }
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not open post');
    }
  }

  function stackDetailNav(el) {
    if (!el || typeof pushNavLayer !== 'function' || el.dataset.navArchiveStacked === '1') return;
    el.dataset.navArchiveStacked = '1';
    pushNavLayer(el, () => {
      el.classList.remove('open');
      setTimeout(() => el.classList.add('hidden'), 300);
      delete el.dataset.navArchiveStacked;
    });
  }

  function postRow(p, collection) {
    const archived = p.archived === true;
    const label = collection === 'duniya' ? 'Duniya' : 'Peepal';
    const title =
      collection === 'duniya' ? (p.caption || 'Post').slice(0, 80) : (p.question || 'Question').slice(0, 80);
    const thumb = p.thumb || p.media || p.attachment?.thumb || p.attachment?.data || '';
    const visLabel = archived ? 'Show on profile' : 'Hide from profile';
    const visIcon = archived ? 'eye' : 'eye-off';
    return `<div class="archive-post-row" data-id="${esc(p.id)}" data-col="${collection}">
      <button type="button" class="archive-post-main" data-archive-open aria-label="Open post">
        ${thumb ? `<img class="archive-thumb" src="${esc(thumb)}" alt="">` : '<div class="archive-thumb archive-thumb--empty">◇</div>'}
        <div class="archive-post-meta">
          <strong>${label}</strong>
          <p>${esc(title)}</p>
          <small class="${archived ? 'is-archived' : ''}">${archived ? 'Hidden from profile' : 'Live on profile'}</small>
        </div>
      </button>
      <div class="archive-post-actions">
        <button type="button" class="archive-post-icon-btn" data-toggle-profile-vis="${archived ? '0' : '1'}" aria-label="${visLabel}" title="${visLabel}">${ico(visIcon, 18)}</button>
        <button type="button" class="archive-post-icon-btn" data-archive-edit aria-label="Edit post" title="Edit">${ico('pen', 16)}</button>
      </div>
    </div>`;
  }

  function wireArchivePostRows(host, onDone) {
    host.querySelectorAll('.archive-post-row').forEach((rowEl) => {
      rowEl.querySelector('[data-archive-open]')?.addEventListener('click', () => {
        openPostFromArchive(rowEl.dataset.col, rowEl.dataset.id);
      });
      rowEl.querySelector('[data-toggle-profile-vis]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const archived = btn.getAttribute('data-toggle-profile-vis') === '1';
        try {
          await setPostArchived(rowEl.dataset.col, rowEl.dataset.id, archived);
          if (typeof showToast === 'function') {
            showToast(archived ? 'Hidden from profile' : 'Shown on profile');
          }
          if (typeof onDone === 'function') onDone();
        } catch (err) {
          if (typeof showToast === 'function') showToast('Could not update');
        }
      });
      rowEl.querySelector('[data-archive-edit]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const col = rowEl.dataset.col;
        const id = rowEl.dataset.id;
        if (!db || !id) return;
        try {
          const doc = await db.collection(col).doc(id).get();
          if (!doc.exists) return;
          const raw = { id: doc.id, ...doc.data() };
          if (col === 'duniya') {
            const post =
              typeof mapDuniyaDoc === 'function' ? mapDuniyaDoc(raw) : { ...raw, firestoreId: doc.id };
            if (typeof DuniyaCompose !== 'undefined' && DuniyaCompose.openEdit) DuniyaCompose.openEdit(post);
          } else if (typeof openPeepalEditSheet === 'function') {
            const post = typeof mapPeepalDoc === 'function' ? mapPeepalDoc(raw) : raw;
            openPeepalEditSheet(post);
          }
        } catch (err) {
          if (typeof showToast === 'function') showToast('Could not open editor');
        }
      });
    });
  }

  function wireInteractionRows(host) {
    host.querySelectorAll('[data-open-interaction]').forEach((row) => {
      row.addEventListener('click', () => {
        const col = row.dataset.collection;
        const postId = row.dataset.postId;
        if (!col || !postId) return;
        const normalized = col === 'peepal' || col === 'duniya' ? col : 'duniya';
        openPostFromArchive(normalized, postId);
      });
    });
  }

  function jc() {
    return typeof JournalCheckIn !== 'undefined' ? JournalCheckIn : null;
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

  function showHostLoading(host, variant = 'detail', count = 2) {
    if (!host) return;
    if (typeof renderSkeleton === 'function') renderSkeleton(host, { variant, count });
    else host.innerHTML = '<div class="comments-empty">Loading…</div>';
  }

  function showHostError(host, onRetry, err) {
    if (!host) return;
    if (typeof renderErrorState === 'function') {
      renderErrorState(host, {
        message: typeof friendlyError === 'function' ? friendlyError(err) : 'Please try again.',
        onRetry,
      });
    } else {
      host.innerHTML = '<div class="comments-empty">Could not load</div>';
    }
  }

  async function renderJournalTab(body, setTab, getSearch) {
    body.innerHTML = `<p class="archive-hub-copy">${ahT('archive_journal_copy', 'Private journal — never visible on your public profile.')}</p>
      ${renderJournalComposeHtml()}
      <div data-ah-journal></div>`;
    const journalHost = body.querySelector('[data-ah-journal]');
    showHostLoading(journalHost, 'list', 3);
    if (!db || !currentUser) {
      renderGuestGate(body);
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
      const q = typeof getSearch === 'function' ? getSearch() : '';
      const entries = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => matchesSearch(q, e.text))
        .sort((a, b) => {
          const am = jc()?.entryCreatedMs?.(a) || 0;
          const bm = jc()?.entryCreatedMs?.(b) || 0;
          if (bm !== am) return bm - am;
          return String(b.date || '').localeCompare(String(a.date || ''));
        });
      host.innerHTML = entries.length
        ? entries.map((e) => journalRowHtml(e)).join('')
        : `<div class="archive-empty">
            <p class="archive-empty-title">${ahT('archive_empty_journal_title', 'No entries yet')}</p>
            <p class="archive-empty-msg">${ahT('archive_empty_journal_msg', 'Write your first entry above — only you can read it.')}</p>
          </div>`;

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

  function duniyaGridCell(p) {
    const archived = p.archived === true;
    const thumb = duniyaThumb(p);
    const title = String(p.caption || '').slice(0, 80);
    const lehar = isLeharPost(p);
    return `<button type="button" class="archive-media-cell${thumb ? '' : ' archive-media-cell--text'}" data-id="${esc(p.id)}" data-col="duniya" aria-label="Open post">
      ${
        thumb
          ? `<img src="${esc(thumb)}" alt="" loading="lazy">`
          : esc(title || 'Post')
      }
      ${lehar ? '<span class="archive-media-badge">Lehar</span>' : ''}
      ${archived ? '<span class="archive-media-badge is-hidden">Hidden</span>' : ''}
    </button>`;
  }

  function peepalListRow(p) {
    const archived = p.archived === true;
    const fmt = p.format || p.type || 'open';
    const title = String(p.question || '').slice(0, 120);
    return `<div class="archive-post-card" data-id="${esc(p.id)}" data-col="peepal">
      <button type="button" class="archive-post-card-main" data-archive-open>
        <span class="archive-format-chip">${esc(String(fmt))}</span>
        <strong>Peepal</strong>
        <p>${esc(title)}</p>
        <small>${archived ? ahT('archive_hidden_profile', 'Hidden from profile') : ahT('archive_live_profile', 'Live on profile')}</small>
      </button>
      <div class="archive-post-actions">
        <button type="button" class="archive-post-icon-btn" data-toggle-profile-vis="${archived ? '0' : '1'}" aria-label="${archived ? 'Show on profile' : 'Hide from profile'}">${ico(archived ? 'eye' : 'eye-off', 18)}</button>
        <button type="button" class="archive-post-icon-btn" data-archive-edit aria-label="Edit">${ico('pen', 16)}</button>
      </div>
    </div>`;
  }

  function wireDuniyaGrid(host, onDone) {
    host.querySelectorAll('.archive-media-cell[data-id]').forEach((cell) => {
      cell.addEventListener('click', () => openPostFromArchive('duniya', cell.dataset.id));
    });
    wireArchivePostRows(host, onDone);
  }

  function wirePeepalList(host, onDone) {
    host.querySelectorAll('.archive-post-card[data-id]').forEach((rowEl) => {
      rowEl.querySelector('[data-archive-open]')?.addEventListener('click', () => {
        openPostFromArchive('peepal', rowEl.dataset.id);
      });
      rowEl.querySelector('[data-toggle-profile-vis]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const archived = btn.getAttribute('data-toggle-profile-vis') === '1';
        try {
          await setPostArchived('peepal', rowEl.dataset.id, archived);
          if (typeof showToast === 'function') {
            showToast(archived ? ahT('archive_hidden_toast', 'Hidden from profile') : ahT('archive_shown_toast', 'Shown on profile'));
          }
          if (typeof onDone === 'function') onDone();
        } catch (err) {
          if (typeof showToast === 'function') showToast(ahT('archive_update_fail', 'Could not update'));
        }
      });
      rowEl.querySelector('[data-archive-edit]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = rowEl.dataset.id;
        if (!db || !id) return;
        try {
          const doc = await db.collection('peepal').doc(id).get();
          if (!doc.exists) return;
          const raw = { id: doc.id, ...doc.data() };
          const post = typeof mapPeepalDoc === 'function' ? mapPeepalDoc(raw) : raw;
          if (typeof openPeepalEditSheet === 'function') openPeepalEditSheet(post);
        } catch (err) {
          if (typeof showToast === 'function') showToast(ahT('archive_edit_fail', 'Could not open editor'));
        }
      });
    });
  }

  function openArchiveHub(initialTab) {
    try {
      document.getElementById('archiveHubSheet')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'archiveHubSheet';
      overlay.className = 'archive-overlay archive-hub';
      overlay.setAttribute('data-nav-managed', '1');
      overlay.innerHTML = `
        <div class="archive-hub-header">
          ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-archive-hub-back' }) : '<button type="button" data-archive-hub-back class="cp-back-btn" aria-label="Back">←</button>'}
          <div class="archive-hub-header-copy">
            <span class="archive-hub-title">${ahT('archive_title', 'Archive')}</span>
            <div class="archive-hub-subtitle">${ahT('archive_subtitle', 'Private to you')}</div>
          </div>
        </div>
        <div class="archive-hub-search-wrap">
          <input type="search" class="archive-hub-search" data-ah-search placeholder="${ahT('archive_search_ph', 'Search this tab…')}" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="archive-hub-segments" role="tablist">
          ${TAB_IDS.map(
            (id) =>
              `<button type="button" role="tab" data-ah-tab="${id}" aria-selected="false">${tabLabel(id)}</button>`
          ).join('')}
        </div>
        <div class="archive-hub-body" data-ah-body role="tabpanel"></div>`;

      document.querySelector('.device')?.appendChild(overlay);

      const body = overlay.querySelector('[data-ah-body]');
      const searchInput = overlay.querySelector('[data-ah-search]');
      let activeTab = normalizeTab(initialTab);
      let searchQuery = '';

      const close = () => {
        if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
        if (overlay.isConnected) overlay.remove();
        document.removeEventListener('keydown', onKey);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', onKey);

      if (typeof openLayer === 'function') openLayer(overlay, close, { remove: false, label: 'Archive' });
      else if (typeof pushNavLayer === 'function') {
        overlay.dataset.navManaged = '1';
        pushNavLayer(overlay, close);
      }
      overlay.querySelector('[data-archive-hub-back]')?.addEventListener('click', close);

      const getSearch = () => String(searchQuery || searchInput?.value || '').trim().toLowerCase();

      const setTab = async (tab) => {
        activeTab = tab;
        try {
          sessionStorage.setItem(TAB_SESSION_KEY, tab);
        } catch (e) {}
        overlay.querySelectorAll('[data-ah-tab]').forEach((b) => {
          const on = b.dataset.ahTab === tab;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        if (!currentUser) {
          body.innerHTML = '';
          renderGuestGate(body);
          return;
        }

        if (tab === 'journal') {
          await renderJournalTab(body, setTab, getSearch);
          return;
        }

        if (tab === 'interactions') {
          body.innerHTML = `<p class="archive-hub-copy">${ahT('archive_activity_copy', 'Likes, comments, and saves — your activity across Chaupaal.')}</p>
            <div class="archive-hub-tabs archive-hub-tabs--sub">
              <button type="button" data-ah-ix="saved" class="active">${ahT('archive_ix_saved', 'Saved')}</button>
              <button type="button" data-ah-ix="likes">${ahT('archive_ix_likes', 'Likes')}</button>
              <button type="button" data-ah-ix="comments">${ahT('archive_ix_comments', 'Comments')}</button>
            </div>
            <div data-ah-ix-body></div>`;
          const ixBody = body.querySelector('[data-ah-ix-body]');
          showHostLoading(ixBody, 'list', 4);
          const loadIx = async (kind) => {
            body.querySelectorAll('[data-ah-ix]').forEach((b) => b.classList.toggle('active', b.dataset.ahIx === kind));
            if (!db || !currentUser) {
              ixBody.innerHTML = `<div class="archive-empty"><p class="archive-empty-msg">${ahT('archive_sign_in_ix', 'Sign in to see interactions')}</p></div>`;
              return;
            }
            showHostLoading(ixBody, 'list', 4);
            const q = getSearch();
            try {
              if (kind === 'saved') {
                const snap = await db
                  .collection('users')
                  .doc(currentUser.uid)
                  .collection('saved')
                  .orderBy('savedAt', 'desc')
                  .limit(50)
                  .get()
                  .catch(() => db.collection('users').doc(currentUser.uid).collection('saved').limit(50).get());
                const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => matchesSearch(q, `${r.preview} ${r.collection} ${r.postId}`));
                ixBody.innerHTML = rows.length
                  ? rows
                      .map(
                        (r) =>
                          `<button type="button" class="archive-post-row archive-post-row--ix" data-open-interaction data-collection="${esc(r.collection || 'duniya')}" data-post-id="${esc(r.postId || r.refId || '')}">
                            <div class="archive-post-meta"><strong>${esc(r.collection || 'post')}</strong><p>${esc(String(r.preview || r.postId || '').slice(0, 100))}</p><small>${ahT('archive_ix_saved', 'Saved')}</small></div>
                          </button>`
                      )
                      .join('')
                  : `<div class="archive-empty"><p class="archive-empty-title">${ahT('archive_empty_saved_title', 'No saved posts')}</p><p class="archive-empty-msg">${ahT('archive_empty_saved_msg', 'Tap the bookmark on Duniya or Peepal to save posts here.')}</p></div>`;
                wireInteractionRows(ixBody);
                return;
              }
              if (kind === 'likes') {
                const snap = await db.collection('users').doc(currentUser.uid).collection('likes').limit(40).get().catch(() => null);
                const rows = (snap?.docs?.map((d) => ({ id: d.id, ...d.data() })) || []).filter((r) => matchesSearch(q, `${r.preview} ${r.collection} ${r.postId}`));
                ixBody.innerHTML = rows.length
                  ? rows
                      .map(
                        (r) =>
                          `<button type="button" class="archive-post-row archive-post-row--ix" data-open-interaction data-collection="${esc(r.collection || 'like')}" data-post-id="${esc(r.postId || r.refId || '')}">
                            <div class="archive-post-meta"><strong>${esc(r.collection || 'like')}</strong><p>${esc(String(r.preview || r.postId || '').slice(0, 100))}</p></div>
                          </button>`
                      )
                      .join('')
                  : `<div class="archive-empty"><p class="archive-empty-msg">${ahT('archive_empty_likes', 'Liked posts will show here')}</p></div>`;
                wireInteractionRows(ixBody);
                return;
              }
              const snap = await db.collection('users').doc(currentUser.uid).collection('comment_activity').limit(40).get().catch(() => null);
              const rows = (snap?.docs?.map((d) => ({ id: d.id, ...d.data() })) || []).filter((r) => matchesSearch(q, `${r.text} ${r.preview} ${r.postId}`));
              ixBody.innerHTML = rows.length
                ? rows
                    .map(
                      (r) =>
                        `<button type="button" class="archive-post-row archive-post-row--ix" data-open-interaction data-collection="${esc(r.collection || 'comment')}" data-post-id="${esc(r.postId || r.refId || '')}">
                          <div class="archive-post-meta"><strong>${esc(r.collection || 'comment')}</strong><p>${esc(String(r.text || r.preview || '').slice(0, 120))}</p></div>
                        </button>`
                    )
                    .join('')
                : `<div class="archive-empty"><p class="archive-empty-msg">${ahT('archive_empty_comments', 'Your comments will gather here')}</p></div>`;
              wireInteractionRows(ixBody);
            } catch (e) {
              showHostError(ixBody, () => loadIx(kind), e);
            }
          };
          body.querySelectorAll('[data-ah-ix]').forEach((btn) => {
            btn.addEventListener('click', () => loadIx(btn.dataset.ahIx));
          });
          loadIx('saved');
          return;
        }

        if (tab === 'stories') {
          body.innerHTML = `<p class="archive-hub-copy">${ahT('archive_stories_copy', 'Stories archive after expiry. Highlights stay on your profile until you remove them.')}</p>
            <div class="archive-hub-actions">
              <button type="button" class="btn" data-ah-new-highlight>${ahT('archive_new_highlight', 'New Highlight')}</button>
              <button type="button" class="btn btn--primary" data-ah-story-archive>${ahT('archive_open_story_archive', 'Open story archive')}</button>
            </div>
            <div data-ah-highlights></div>
            <div data-ah-story-list></div>`;
          const hlHost = body.querySelector('[data-ah-highlights]');
          showHostLoading(hlHost, 'card', 2);
          body.querySelector('[data-ah-story-archive]')?.addEventListener('click', () => {
            if (typeof openStoryArchive === 'function') openStoryArchive();
          });
          body.querySelector('[data-ah-new-highlight]')?.addEventListener('click', async () => {
            const title =
              typeof promptNameSheet === 'function'
                ? await promptNameSheet({
                    title: ahT('archive_new_highlight', 'New Highlight'),
                    placeholder: 'e.g. Travel, Wins, Favorites',
                    confirmLabel: 'Create',
                  })
                : null;
            if (!title || typeof storyCall !== 'function') return;
            try {
              await storyCall('create_highlight', { title });
              if (typeof showToast === 'function') showToast(ahT('archive_highlight_created', 'Highlight created'));
              setTab('stories');
            } catch (e) {
              if (typeof showToast === 'function') showToast(ahT('archive_highlight_fail', 'Could not create highlight'));
            }
          });
          try {
            const data = typeof storyCall === 'function' ? await storyCall('list_highlights', {}) : { highlights: [] };
            const list = data.highlights || [];
            const q = getSearch();
            const filtered = list.filter((h) => matchesSearch(q, `${h.title} ${h.storyCount}`));
            hlHost.innerHTML = filtered.length
              ? `<div class="archive-highlight-circles">${filtered
                  .map(
                    (h) =>
                      `<button type="button" class="archive-highlight-circle" data-manage-hl="${esc(h.id)}">
                        <span>${h.coverUrl ? `<img src="${esc(h.coverUrl)}" alt="">` : ''}</span>
                        <em>${esc(h.title)}</em>
                      </button>`
                  )
                  .join('')}</div>`
              : `<div class="archive-empty"><p class="archive-empty-msg">${ahT('archive_no_highlights', 'No Highlights yet')}</p></div>`;
            hlHost.querySelectorAll('[data-manage-hl]').forEach((btn) => {
              btn.addEventListener('click', () => {
                if (typeof openManageHighlightSheet === 'function') {
                  openManageHighlightSheet(btn.dataset.manageHl, () => setTab('stories'));
                }
              });
            });
          } catch (e) {
            showHostError(hlHost, () => setTab('stories'), e);
          }
          try {
            const archived = typeof storyCall === 'function' ? await storyCall('archive', {}) : { stories: [] };
            const stories = (archived.stories || []).filter((s) => matchesSearch(getSearch(), `${s.text} ${s.destination}`));
            const listHost = body.querySelector('[data-ah-story-list]');
            const live = stories.filter((s) => !s.archived && !s.saveOnly && s.active).length;
            const archivedCount = stories.filter((s) => s.archived || s.saveOnly || !s.active).length;
            const hlCount = (typeof storyCall === 'function' ? (await storyCall('list_highlights', {}).catch(() => ({ highlights: [] }))) : { highlights: [] }).highlights?.length || 0;
            listHost.innerHTML = `
              <div class="archive-hub-stat-row">
                <div class="archive-hub-stat"><strong>${live}</strong>${ahT('archive_stat_live', 'Live')}</div>
                <div class="archive-hub-stat"><strong>${archivedCount}</strong>${ahT('archive_stat_archived', 'Archived')}</div>
                <div class="archive-hub-stat"><strong>${hlCount}</strong>${ahT('archive_stat_highlights', 'Highlights')}</div>
              </div>
              ${
                stories.length
                  ? `<div class="archive-story-grid">${stories
                      .slice(0, 40)
                      .map((s) => {
                        const mark = s.archived || s.saveOnly || !s.active ? ahT('archive_hidden_profile', 'Archived') : ahT('archive_live_profile', 'Live');
                        const thumb = s.thumb || s.media || '';
                        return `<button type="button" class="archive-story-thumb" type="button" aria-label="Story">
                          ${thumb ? `<img src="${esc(thumb)}" alt="">` : ''}
                          <span class="archive-media-badge">${esc(s.destination || 'story')} · ${esc(mark)}</span>
                        </button>`;
                      })
                      .join('')}</div>`
                  : `<div class="archive-empty"><p class="archive-empty-msg">${ahT('archive_no_stories', 'No stories in archive yet')}</p></div>`
              }`;
          } catch (e) {
            /* optional */
          }
          return;
        }

        if (tab === 'deleted') {
          body.innerHTML = '<div data-ah-deleted></div>';
          const delHost = body.querySelector('[data-ah-deleted]');
          if (typeof renderRecoveryBinInto === 'function') {
            renderRecoveryBinInto(delHost, { onRefresh: () => setTab('deleted') });
          } else if (typeof openRecoveryBin === 'function') {
            delHost.innerHTML = `<p class="archive-hub-copy">${ahT('archive_deleted_fallback', 'Open recovery bin')}</p><button type="button" class="btn btn--primary" data-open-bin>${ahT('archive_tab_deleted', 'Deleted')}</button>`;
            delHost.querySelector('[data-open-bin]')?.addEventListener('click', () => openRecoveryBin());
          }
          return;
        }

        if (tab === 'duniya') {
          body.innerHTML = `<p class="archive-hub-copy">${ahT('archive_posts_copy', 'Duniya and Lehar posts — hide from profile without deleting.')}</p>
            <div class="archive-hub-filters" data-ah-duniya-filter>
              <button type="button" data-filter="all" class="active">${ahT('archive_filter_all', 'All')}</button>
              <button type="button" data-filter="live">${ahT('archive_filter_live', 'On profile')}</button>
              <button type="button" data-filter="hidden">${ahT('archive_filter_hidden', 'Hidden')}</button>
              <button type="button" data-filter="lehar">Lehar</button>
            </div>
            <div data-ah-posts></div>`;
          const postsHost = body.querySelector('[data-ah-posts]');
          let duniyaFilter = 'all';
          const renderDuniya = async () => {
            showHostLoading(postsHost, 'card', 6);
            try {
              let posts = await loadOwnerPosts('duniya');
              const q = getSearch();
              posts = posts.filter((p) => matchesSearch(q, `${p.caption} ${p.id}`));
              if (duniyaFilter === 'live') posts = posts.filter((p) => !p.archived);
              else if (duniyaFilter === 'hidden') posts = posts.filter((p) => p.archived);
              else if (duniyaFilter === 'lehar') posts = posts.filter((p) => isLeharPost(p));
              const withMedia = posts.filter((p) => duniyaThumb(p));
              const textOnly = posts.filter((p) => !duniyaThumb(p));
              postsHost.innerHTML =
                (withMedia.length
                  ? `<div class="archive-media-grid">${withMedia.map((p) => duniyaGridCell(p)).join('')}</div>`
                  : '') +
                (textOnly.length
                  ? `<div class="archive-post-list" style="margin-top:12px">${textOnly.map((p) => postRow(p, 'duniya')).join('')}</div>`
                  : '') ||
                `<div class="archive-empty"><p class="archive-empty-title">${ahT('archive_empty_posts_title', 'No posts yet')}</p><p class="archive-empty-msg">${ahT('archive_empty_posts_msg', 'Your Duniya posts will appear here.')}</p></div>`;
              wireDuniyaGrid(postsHost, renderDuniya);
            } catch (e) {
              showHostError(postsHost, renderDuniya, e);
            }
          };
          body.querySelectorAll('[data-ah-duniya-filter] [data-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
              duniyaFilter = btn.dataset.filter || 'all';
              body.querySelectorAll('[data-ah-duniya-filter] [data-filter]').forEach((b) => b.classList.toggle('active', b === btn));
              renderDuniya();
            });
          });
          await renderDuniya();
          return;
        }

        if (tab === 'peepal') {
          body.innerHTML = `<p class="archive-hub-copy">${ahT('archive_discuss_copy', 'Peepal questions — hide from profile without deleting.')}</p><div data-ah-posts class="archive-post-list"></div>`;
          const postsHost = body.querySelector('[data-ah-posts]');
          showHostLoading(postsHost, 'list', 4);
          try {
            let posts = await loadOwnerPosts('peepal');
            const q = getSearch();
            posts = posts.filter((p) => matchesSearch(q, `${p.question} ${p.tag}`));
            postsHost.innerHTML = posts.length
              ? posts.map((p) => peepalListRow(p)).join('')
              : `<div class="archive-empty"><p class="archive-empty-title">${ahT('archive_empty_discuss_title', 'No questions yet')}</p><p class="archive-empty-msg">${ahT('archive_empty_discuss_msg', 'Your Peepal posts will appear here.')}</p></div>`;
            wirePeepalList(postsHost, () => setTab('peepal'));
          } catch (e) {
            showHostError(postsHost, () => setTab('peepal'), e);
          }
          return;
        }
      };

      overlay.querySelectorAll('[data-ah-tab]').forEach((btn) => {
        btn.addEventListener('click', () => setTab(btn.dataset.ahTab));
      });

      let searchTimer;
      searchInput?.addEventListener('input', () => {
        searchQuery = searchInput.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => setTab(activeTab), 220);
      });

      setTab(activeTab);
    } catch (err) {
      console.error('[archive-hub] openArchiveHub failed', err);
      if (typeof showToast === 'function') {
        showToast(ahT('archive_open_fail', 'Could not open Archive — try again'));
      }
    }
  }

  window.openArchiveHub = openArchiveHub;
  window.setPostArchived = setPostArchived;

  if (typeof window.openArchiveHub !== 'function') {
    throw new Error('[archive-hub] openArchiveHub export failed');
  }

  if (typeof location !== 'undefined' && /archive_test=1/.test(location.search || '')) {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        if (typeof openArchiveHub !== 'function') throw new Error('missing');
      } catch (e) {
        console.error('[archive-hub] self-test failed', e);
      }
    });
  }
})();
