/**
 * Instagram-structured profile body: Highlights above tabs,
 * then Digital (dating) · Duniya 3×3 · Peepal 2×2 · custom tabs.
 * Migrates legacy sectionOrder → tabOrder without wiping customs.
 */
(function () {
  'use strict';

  const CORE_TABS = [
    { id: 'digital', label: 'Digital', builtin: true },
    { id: 'duniya', label: 'Duniya', builtin: true },
    { id: 'peepal', label: 'Peepal', builtin: true },
  ];

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
        if (core) return { ...core };
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
    const prompts = Array.isArray(dp.prompts) ? dp.prompts.filter((p) => p?.answer) : [];
    const ice = Array.isArray(dp.icebreakers) ? dp.icebreakers.filter((a) => a?.answer) : [];
    const cards = [];
    prompts.slice(0, 3).forEach((p) => {
      cards.push(`<div class="cp-prompt-card"><span>${esc(p.prompt || p.question || 'Prompt')}</span><p>${esc(p.answer)}</p></div>`);
    });
    ice.slice(0, 2).forEach((a) => {
      const q =
        a.customQuestion ||
        (typeof getIcebreakerPromptById === 'function' ? getIcebreakerPromptById(a.promptId)?.text : null) ||
        'Icebreaker';
      cards.push(`<div class="cp-prompt-card"><span>${esc(q)}</span><p>${esc(a.answer)}</p></div>`);
    });
    return cards.join('');
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

  function renderDigitalPane(dp, { isOwner, view, editable } = {}) {
    const bio = String(dp.bio || '').trim();
    const bioHtml = bio
      ? typeof linkifyText === 'function'
        ? linkifyText(bio)
        : esc(bio)
      : `<div class="public-profile-posts-empty">${isOwner ? 'Add a bio — this is your dating-style about' : 'No bio yet'}</div>`;
    const interests = [...new Set([...(dp.interests || []), ...(Array.isArray(dp.hobbies) ? dp.hobbies : [])])].filter(Boolean);
    const lifestyle = [dp.diet, dp.drinking, dp.smoking, dp.fitness].filter(Boolean);
    const prompts = promptCards(dp);
    const about = aboutRows(dp, view);
    return `
      <div class="cp-digital-pane">
        <section class="cp-digital-block" data-digital-block="bio">
          <h3 class="cp-digital-h">About</h3>
          <div class="profile-flexible-block">${bioHtml}</div>
        </section>
        ${
          prompts
            ? `<section class="cp-digital-block" data-digital-block="prompts"><h3 class="cp-digital-h">Prompts</h3><div class="cp-prompt-stack">${prompts}</div></section>`
            : isOwner
              ? `<section class="cp-digital-block"><h3 class="cp-digital-h">Prompts</h3><div class="public-profile-posts-empty">Add prompts in Edit · Personal</div></section>`
              : ''
        }
        ${
          about
            ? `<section class="cp-digital-block is-collapsible" data-digital-block="about">
                <button type="button" class="cp-digital-h cp-collapse-btn" data-collapse>Essentials <span>▾</span></button>
                <dl class="cp-about-dl">${about}</dl>
              </section>`
            : ''
        }
        ${
          interests.length
            ? `<section class="cp-digital-block" data-digital-block="interests"><h3 class="cp-digital-h">Interests</h3>${chipRow(interests)}</section>`
            : ''
        }
        ${
          lifestyle.length
            ? `<section class="cp-digital-block is-collapsible" data-digital-block="lifestyle">
                <button type="button" class="cp-digital-h cp-collapse-btn" data-collapse>Lifestyle <span>▾</span></button>
                ${chipRow(lifestyle)}
              </section>`
            : ''
        }
        <section class="cp-digital-block" data-digital-block="media" data-lazy-media></section>
        <section class="cp-digital-block" data-digital-block="links" data-lazy-links></section>
        ${editable ? `<p class="cp-digital-edit-hint">Edit fields below (or switch to Edit my profile) — values land in these same slots.</p>` : ''}
      </div>`;
  }

  async function fillPostGrid(bodyEl, col, profileUid, { isOwner, includeArchived, cols } = {}) {
    if (!bodyEl || !db || !profileUid) return;
    bodyEl.innerHTML = '<div class="public-profile-posts-empty">Loading…</div>';
    try {
      let snap;
      try {
        snap = await db.collection(col).where('uid', '==', profileUid).orderBy('createdAt', 'desc').limit(48).get();
      } catch (e) {
        snap = await db.collection(col).where('uid', '==', profileUid).limit(48).get();
      }
      let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
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
            const media = p.thumb || p.media || p.image || '';
            return `<button type="button" class="cp-post-cell" data-open-post="duniya" data-post-id="${esc(p.id)}">
              ${media ? `<img src="${esc(media)}" alt="">` : `<span>${esc((p.caption || 'Post').slice(0, 40))}</span>`}
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
      bodyEl.innerHTML = '<div class="public-profile-posts-empty">Posts unavailable</div>';
    }
  }

  function renderCustomPane(tab, { editable } = {}) {
    const layout = tab.layout || tab.type || 'grid';
    const body =
      typeof renderCustomSectionBody === 'function'
        ? renderCustomSectionBody({ ...tab, type: layout === 'stack' || layout === 'list' ? (layout === 'list' ? 'links' : 'flexible') : layout })
        : '<div class="public-profile-posts-empty">Empty section</div>';
    return `<div class="cp-custom-pane" data-layout="${esc(layout)}" data-section-id="${esc(tab.id)}">
      ${editable ? `<div class="cp-custom-toolbar">
        <button type="button" class="btn" data-edit-custom="${esc(tab.id)}">Edit section</button>
        <span class="profile-section-drag" data-tab-drag="${esc(tab.id)}" title="Drag to reorder tabs">⠿</span>
      </div>` : ''}
      <div class="cp-custom-body" data-custom-layout="${esc(layout)}">${body}</div>
    </div>`;
  }

  async function mountProfileShell(host, opts = {}) {
    if (!host) return;
    const profileUid = opts.uid || currentUser?.uid;
    if (!profileUid) return;
    const isOwner = opts.isOwner !== false && profileUid === currentUser?.uid;
    const editable = !!opts.editable && isOwner;
    const includeArchived = !!opts.includeArchived && isOwner;
    const profile = opts.profile || (typeof digitalProfile !== 'undefined' ? digitalProfile : {});
    const view = opts.view || null;
    const tabs = visibleTabs(profile, { isOwner, editMode: editable });
    const initial = opts.initialTab || 'digital';

    host.innerHTML = `
      <div class="cp-profile-shell" data-profile-shell>
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
        pane.innerHTML = renderDigitalPane(profile, { isOwner, view, editable });
        pane.querySelectorAll('[data-collapse]').forEach((btn) => {
          btn.addEventListener('click', () => {
            btn.closest('.cp-digital-block')?.classList.toggle('is-collapsed');
          });
        });
        const mediaHost = pane.querySelector('[data-lazy-media]');
        const linksHost = pane.querySelector('[data-lazy-links]');
        if (mediaHost && typeof fillProfileSectionBody === 'function') {
          await fillProfileSectionBody(mediaHost, 'media', profileUid, {
            isOwner,
            profileMedia: profile.profileMedia,
            profile,
          });
        }
        if (linksHost && typeof fillProfileSectionBody === 'function') {
          await fillProfileSectionBody(linksHost, 'links', profileUid, {
            isOwner,
            profile,
          });
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

    // Drag custom tabs to reorder (edit mode)
    if (editable) {
      const tabBar = host.querySelector('[data-profile-tabs]');
      let dragTab = null;
      tabBar?.querySelectorAll('.cp-profile-tab[data-tab]').forEach((btn) => {
        if (['digital', 'duniya', 'peepal'].includes(btn.dataset.tab)) return;
        btn.draggable = true;
        btn.addEventListener('dragstart', () => {
          dragTab = btn.dataset.tab;
          btn.classList.add('is-dragging');
        });
        btn.addEventListener('dragend', async () => {
          btn.classList.remove('is-dragging');
          const order = ['digital', 'duniya', 'peepal'];
          tabBar.querySelectorAll('.cp-profile-tab[data-tab]').forEach((b) => {
            if (!order.includes(b.dataset.tab)) order.push(b.dataset.tab);
          });
          await persistTabOrder(order);
          dragTab = null;
        });
        btn.addEventListener('dragover', (e) => e.preventDefault());
        btn.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!dragTab || dragTab === btn.dataset.tab) return;
          const from = tabBar.querySelector(`[data-tab="${dragTab}"]`);
          if (from) tabBar.insertBefore(from, btn);
        });
      });
    }

    const start = tabs.find((t) => t.id === initial)?.id || tabs[0]?.id || 'digital';
    await activateTab(start);
    if (typeof restoreAppShell === 'function') restoreAppShell();
  }

  window.PROFILE_CORE_TABS = CORE_TABS;
  window.PROFILE_DIGITAL_BLOCKS = DIGITAL_BLOCKS;
  window.mountProfileShell = mountProfileShell;
  window.getProfileTabOrder = migrateTabOrder;
  window.persistProfileTabOrder = persistTabOrder;
  window.visibleProfileTabs = visibleTabs;
})();
