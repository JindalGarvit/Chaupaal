/**
 * Mount ordered profile sections (highlights, media, duniya, peepal, custom)
 * into a host element for own Preview/Edit or third-person profiles.
 */
(function () {
  'use strict';

  function wireProfilePostOpens(bodyEl) {
    if (!bodyEl) return;
    bodyEl.querySelectorAll('[data-open-post]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.postId;
        const kind = btn.dataset.openPost;
        if (!id || !db) return;
        try {
          if (kind === 'duniya') {
            const doc = await db.collection('duniya').doc(id).get();
            if (doc.exists && typeof openDuniyaDetail === 'function') {
              const raw = { id: doc.id, ...doc.data() };
              const post = typeof mapDuniyaDoc === 'function' ? mapDuniyaDoc(raw) : raw;
              openDuniyaDetail(post);
              return;
            }
          }
          if (kind === 'peepal') {
            const doc = await db.collection('peepal').doc(id).get();
            if (doc.exists && typeof openPeepalDetail === 'function') {
              const raw = { id: doc.id, ...doc.data() };
              const post = typeof mapPeepalDoc === 'function' ? mapPeepalDoc(raw) : raw;
              openPeepalDetail(post);
              return;
            }
          }
        } catch (e) {}
        if (typeof showToast === 'function') showToast('Could not open post');
      });
    });
  }

  async function fillBuiltinBody(bodyEl, sectionId, profileUid, opts = {}) {
    if (!bodyEl || !profileUid) return;
    const { isOwner, includeArchived, profileMedia } = opts;
    const dp =
      opts.profile ||
      (typeof digitalProfile !== 'undefined' && profileUid === currentUser?.uid ? digitalProfile : {}) ||
      {};

    if (sectionId === 'bio') {
      const bio = String(dp.bio || '').trim();
      const about =
        typeof linkifyText === 'function' && bio ? linkifyText(bio) : (bio || '').replace(/</g, '&lt;');
      bodyEl.innerHTML = about
        ? `<div class="profile-flexible-block">${about}</div>`
        : `<div class="public-profile-posts-empty">${isOwner ? 'Add a short bio in Edit · Personal' : 'No bio yet'}</div>`;
      return;
    }

    if (sectionId === 'stats') {
      const streak =
        (typeof getStreak === 'function' && getStreak()) ||
        (typeof userProfile !== 'undefined' && userProfile?.streak) ||
        0;
      const friends = Number((typeof userProfile !== 'undefined' && userProfile?.friendsCount) || 0);
      const posts = Number((typeof userProfile !== 'undefined' && userProfile?.postsCount) || 0);
      bodyEl.innerHTML = `<div class="profile-stats-row">
        <div><span>${streak || '—'}</span>streak</div>
        <div><span>${friends || '—'}</span>friends</div>
        <div><span>${posts || '—'}</span>posts</div>
      </div>`;
      return;
    }

    if (sectionId === 'links') {
      const links = [];
      if (dp.website) links.push({ label: 'Website', url: dp.website });
      if (dp.instagram) links.push({ label: 'Instagram', url: 'https://instagram.com/' + String(dp.instagram).replace(/^@/, '') });
      const custom = Array.isArray(dp.profileLinks) ? dp.profileLinks : [];
      custom.forEach((l) => {
        if (l?.url) links.push({ label: l.label || 'Link', url: l.url });
      });
      if (!links.length) {
        bodyEl.innerHTML = `<div class="public-profile-posts-empty">${isOwner ? 'Add website or socials in Edit · Social' : 'No links'}</div>`;
        return;
      }
      bodyEl.innerHTML = `<div class="profile-links-list">${links
        .slice(0, 8)
        .map((l) => `<a class="profile-link-chip" href="${String(l.url).replace(/"/g, '')}" data-external-link="1">${(l.label || 'Link').replace(/</g, '&lt;')}</a>`)
        .join('')}</div>`;
      return;
    }

    if (sectionId === 'pinned') {
      const pinned = Array.isArray(dp.pinnedPosts) ? dp.pinnedPosts : [];
      if (!pinned.length) {
        bodyEl.innerHTML = `<div class="public-profile-posts-empty">${isOwner ? 'Pin posts from Archive (coming soon empty state)' : 'Nothing pinned'}</div>`;
        return;
      }
      bodyEl.innerHTML = `<div class="public-profile-posts">${pinned
        .slice(0, 6)
        .map((it) => {
          const src = it.thumb || it.url || '';
          return src
            ? `<div class="public-profile-post-cell"><img src="${src}" alt=""></div>`
            : `<div class="public-profile-post-cell"><span>${String(it.caption || '').slice(0, 40)}</span></div>`;
        })
        .join('')}</div>`;
      return;
    }

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
              return `<button type="button" class="public-profile-post-cell" data-open-post="duniya" data-post-id="${String(p.id).replace(/"/g, '&quot;')}">${media ? `<img src="${media}" alt="">` : `<span>${(p.caption || '').slice(0, 40)}</span>`}${archived}</button>`;
            })
            .join('')}</div>`;
        } else {
          bodyEl.innerHTML = `<div class="public-profile-posts">${posts
            .slice(0, 8)
            .map((p) => {
              const q =
                typeof linkifyText === 'function'
                  ? linkifyText(String(p.question || '').slice(0, 120))
                  : String(p.question || '').slice(0, 120);
              const archived =
                p.archived === true && isOwner ? '<span class="arch-pill">Archived</span>' : '';
              return `<button type="button" class="public-profile-peepal-card" data-open-post="peepal" data-post-id="${String(p.id).replace(/"/g, '&quot;')}"><strong>${p.tag || 'Peepal'}</strong>${archived}<p>${q}</p></button>`;
            })
            .join('')}</div>`;
        }
        wireProfilePostOpens(bodyEl);
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
          profile,
        });
      } else if (typeof renderCustomSectionBody === 'function') {
        body.innerHTML = renderCustomSectionBody(meta);
      }
    }

    const onPostsChanged = () => {
      if (!host.isConnected) {
        document.removeEventListener('chaupaal:profile-posts-changed', onPostsChanged);
        return;
      }
      sections
        .filter((m) => m.id === 'duniya' || m.id === 'peepal')
        .forEach((meta) => {
          const body = host.querySelector(`[data-section-body="${meta.id}"]`);
          if (body) {
            fillBuiltinBody(body, meta.id, profileUid, {
              isOwner,
              includeArchived,
              profileMedia: profile.profileMedia,
              profile,
            });
          }
        });
    };
    document.addEventListener('chaupaal:profile-posts-changed', onPostsChanged);

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
