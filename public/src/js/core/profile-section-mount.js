/**
 * Mount ordered profile sections (highlights, media, duniya, peepal, custom)
 * into a host element for own Preview/Edit or third-person profiles.
 */
(function () {
  'use strict';

  async function fillBuiltinBody(bodyEl, sectionId, profileUid, { isOwner, includeArchived, profileMedia } = {}) {
    if (!bodyEl || !profileUid) return;
    const opts = { isOwner, includeArchived, profileMedia };
    if (sectionId === 'highlights') {
      bodyEl.innerHTML = '<span class="public-profile-chrome-label">Story Highlights</span><span>Loading…</span>';
      try {
        const data = typeof storyCall === 'function' ? await storyCall('list_highlights', { targetUid: profileUid }) : { highlights: [] };
        const highlights = data.highlights || [];
        if (!highlights.length) {
          bodyEl.innerHTML = '<span class="public-profile-highlights-empty">No highlights yet</span>';
          return;
        }
        bodyEl.innerHTML = `<div class="public-profile-highlights-row">${highlights
          .map(
            (h) =>
              `<button type="button" class="highlight-circle" data-highlight-id="${h.id}" title="${h.title}">
                ${h.coverUrl ? `<img src="${h.coverUrl}" alt="">` : '<span>◎</span>'}
                <small>${h.title}</small>
              </button>`
          )
          .join('')}</div>`;
        bodyEl.querySelectorAll('[data-highlight-id]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const open = await storyCall('open_highlight', {
                targetUid: profileUid,
                highlightId: btn.dataset.highlightId,
              });
              const stories = open.stories || [];
              if (stories[0] && typeof openStoryViewer === 'function') openStoryViewer(stories[0], stories);
              else if (typeof showToast === 'function') showToast('Empty highlight');
            } catch (e) {
              if (typeof showToast === 'function') showToast('Could not open highlight');
            }
          });
        });
      } catch (e) {
        bodyEl.innerHTML = '<span class="public-profile-highlights-empty">Highlights unavailable</span>';
      }
      return;
    }

    if (sectionId === 'media') {
      const fromOpts = opts.profileMedia;
      const media =
        (Array.isArray(fromOpts) && fromOpts.length
          ? fromOpts
          : typeof digitalProfile !== 'undefined' && profileUid === currentUser?.uid
            ? digitalProfile.profileMedia
            : null) || [];
      const list = Array.isArray(media) ? media : [];
      if (!list.length) {
        bodyEl.innerHTML =
          '<div class="public-profile-media-strip--empty public-profile-chrome-slot"><span>None yet</span></div>';
        return;
      }
      bodyEl.innerHTML = `<div class="public-profile-media-strip">${list
        .slice(0, 9)
        .map((m) => {
          const src = m.url || m.src || m.thumb || '';
          if (m.type === 'voice')
            return `<button type="button" class="ppm-voice ppm-media-cell" data-voice="${src}"><span class="ppm-play">▶</span><span>Voice</span></button>`;
          if (m.type === 'video')
            return `<button type="button" class="ppm-video ppm-media-cell" data-ppm-video="${src}"><video src="${src}" muted playsinline></video><span class="ppm-play">▶</span></button>`;
          return `<img src="${src}" alt="">`;
        })
        .join('')}</div>`;
      return;
    }

    if (sectionId === 'duniya' || sectionId === 'peepal') {
      const col = sectionId;
      bodyEl.innerHTML = 'Loading…';
      if (!db) {
        bodyEl.innerHTML = '<div class="public-profile-posts-empty">Unavailable</div>';
        return;
      }
      try {
        const snap = await db.collection(col).where('uid', '==', profileUid).limit(40).get();
        let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
        if (!includeArchived || !isOwner) {
          posts = posts.filter((p) => p.archived !== true);
        }
        if (!posts.length) {
          bodyEl.innerHTML = `<div class="public-profile-posts-empty">No ${sectionId === 'duniya' ? 'Duniya' : 'Peepal'} posts</div>`;
          return;
        }
        if (sectionId === 'duniya') {
          bodyEl.innerHTML = `<div class="public-profile-posts">${posts
            .slice(0, 12)
            .map((p) => {
              const media = p.thumb || p.media || '';
              const archived = p.archived === true && isOwner ? '<span class="arch-pill">Archived</span>' : '';
              return `<div class="public-profile-post-cell">${media ? `<img src="${media}" alt="">` : `<span>${(p.caption || '').slice(0, 40)}</span>`}${archived}</div>`;
            })
            .join('')}</div>`;
        } else {
          bodyEl.innerHTML = posts
            .slice(0, 8)
            .map((p) => {
              const q =
                typeof linkifyText === 'function'
                  ? linkifyText(String(p.question || '').slice(0, 120))
                  : String(p.question || '').slice(0, 120);
              const archived =
                p.archived === true && isOwner ? '<span class="arch-pill">Archived</span>' : '';
              return `<div class="public-profile-peepal-card"><strong>${p.tag || 'Peepal'}</strong>${archived}<p>${q}</p></div>`;
            })
            .join('');
        }
      } catch (e) {
        bodyEl.innerHTML = '<div class="public-profile-posts-empty">Posts unavailable</div>';
      }
    }
  }

  async function mountOwnProfileSections(host, opts = {}) {
    if (!host) return;
    const profileUid = opts.uid || currentUser?.uid;
    if (!profileUid) return;
    const editable = !!opts.editable;
    const isOwner = opts.isOwner !== false && profileUid === currentUser?.uid;
    const includeArchived = !!opts.includeArchived && isOwner;
    const profile = opts.profile || (typeof digitalProfile !== 'undefined' ? digitalProfile : {});
    const sections =
      typeof visibleProfileSections === 'function'
        ? visibleProfileSections(profile, { isOwner, editMode: editable })
        : [];

    host.innerHTML = sections
      .map((meta) =>
        typeof renderProfileSectionShell === 'function'
          ? renderProfileSectionShell(meta, { editable })
          : `<section data-section-id="${meta.id}"><h3>${meta.label}</h3><div data-section-body="${meta.id}"></div></section>`
      )
      .join('');

    for (const meta of sections) {
      const body = host.querySelector(`[data-section-body="${meta.id}"]`);
      if (!body) continue;
      if (meta.builtin) {
        await fillBuiltinBody(body, meta.id, profileUid, {
          isOwner,
          includeArchived,
          profileMedia: profile.profileMedia,
        });
      } else if (typeof renderCustomSectionBody === 'function') {
        body.innerHTML = renderCustomSectionBody(meta);
      }
    }

    if (editable) {
      if (typeof wireProfileSectionReorder === 'function') {
        wireProfileSectionReorder(host, {
          onReorder: () => {},
        });
      }
      host.querySelectorAll('[data-edit-custom]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (typeof openEditCustomSectionSheet === 'function') {
            openEditCustomSectionSheet(btn.dataset.editCustom, () => {
              if (typeof renderProfileModal === 'function') renderProfileModal();
            });
          }
        });
      });
    }
  }

  window.mountOwnProfileSections = mountOwnProfileSections;
  window.fillProfileSectionBody = fillBuiltinBody;
})();
