/**
 * Deep linking / client router (Phase 4).
 *
 * Paths (shareable + PWA):
 *   /profile/{username}
 *   /post/{id}          — peepal or duniya (resolved by lookup)
 *   /chat/{id}
 *   /u/{username}       — short alias
 *   /p/{id}             — short alias
 *   /c/{id}             — short alias
 *
 * Vercel rewrites unknown paths → index.html; SW serves index.html for navigations.
 * History API keeps the URL without full reloads inside the running app.
 */
(function () {
  const ROUTES = [
    { name: 'profile', re: /^\/(?:profile|u)\/([^/?#]+)\/?$/i },
    { name: 'post', re: /^\/(?:post|p)\/([^/?#]+)\/?$/i },
    { name: 'chat', re: /^\/(?:chat|c)\/([^/?#]+)\/?$/i },
    { name: 'story', re: /^\/story\/([^/?#]+)\/?$/i },
  ];

  function parseDeepLink(pathname = location.pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    for (const r of ROUTES) {
      const m = path.match(r.re);
      if (m) return { name: r.name, id: decodeURIComponent(m[1]) };
    }
    // Query fallbacks (legacy /?post= /?user=)
    const params = new URLSearchParams(location.search);
    if (params.get('post')) return { name: 'post', id: params.get('post') };
    if (params.get('user') || params.get('profile')) {
      return { name: 'profile', id: params.get('user') || params.get('profile') };
    }
    if (params.get('chat')) return { name: 'chat', id: params.get('chat') };
    if (params.get('join') || params.get('groupInvite')) {
      return { name: 'join', id: params.get('join') || params.get('groupInvite') };
    }
    return null;
  }

  function buildDeepLink(name, id) {
    const safe = encodeURIComponent(String(id || '').replace(/^@/, ''));
    if (name === 'profile') return `/profile/${safe}`;
    if (name === 'post') return `/post/${safe}`;
    if (name === 'chat') return `/chat/${safe}`;
    if (name === 'join') return `/join/g/${safe}`;
    if (name === 'story') return `/story/${safe}`;
    return '/';
  }

  function shareUrl(name, id) {
    return `${location.origin}${buildDeepLink(name, id)}`;
  }

  function navigateToDeepLink(pathOrName, id) {
    let path = pathOrName;
    if (id != null) path = buildDeepLink(pathOrName, id);
    if (!path.startsWith('/')) path = '/' + path;
    history.pushState({ chaupaalDeep: true }, '', path);
    return handleDeepLink(parseDeepLink(path));
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      if (b.dataset.tab === tab) b.click();
    });
  }

  function openPublicProfile(user, { uid, username, context = 'profile' } = {}) {
    const u = user || {};
    const profileUid = uid || u.uid || '';
    const uname = String(username || u.username || '').replace(/^@/, '');
    const sheet = document.createElement('div');
    sheet.className = 'archive-overlay public-profile-sheet';
    sheet.dataset.navManaged = '1';
    const profile = { ...(u.profile || {}) };
    // Flatten so visibility helpers see profile.* fields at top level
    const dp = {
      ...profile,
      displayName: u.profile?.displayName || u.name || u.displayName,
      username: uname,
      bio: u.profile?.bio || u.bio || '',
      profileType: u.profileType || u.profile?.profileType,
      profileVisibility: u.profile?.profileVisibility || u.profileVisibility,
      icebreakers: u.profile?.icebreakers || u.icebreakers,
      interests: u.profile?.interests || u.interests,
      hobbies: u.profile?.hobbies || u.hobbies,
    };
    const view =
      typeof getPublicVisibleProfile === 'function'
        ? getPublicVisibleProfile(dp, {
            name: u.name || dp.displayName,
            username: uname,
            photoURL: u.photoURL || null,
            profileType: dp.profileType,
          })
        : {
            displayName: u.name || dp.displayName || (uname ? `@${uname}` : 'Someone'),
            username: uname,
            photoURL: u.photoURL || null,
            bio: dp.bio || '',
            locked: false,
            fields: [],
            profileType: dp.profileType || 'personal',
          };
    const esc =
      typeof escapeHtmlText === 'function'
        ? escapeHtmlText
        : (s) =>
            String(s || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/"/g, '&quot;');
    const media = Array.isArray(u.profile?.profileMedia)
      ? u.profile.profileMedia
      : Array.isArray(u.profileMedia)
        ? u.profileMedia
        : [];
    const interests = view.locked
      ? []
      : [...new Set([...(dp.interests || []), ...(Array.isArray(dp.hobbies) ? dp.hobbies : String(dp.hobbies || '').split(',').map((x) => x.trim())), u.topCat].filter(Boolean))];
    const ice = view.locked
      ? []
      : (Array.isArray(dp.icebreakers) ? dp.icebreakers : []).filter((a) => a?.answer).slice(0, 2);
    const nameHtml =
      typeof formatDisplayNameHtml === 'function'
        ? formatDisplayNameHtml(view.displayName || (uname ? `@${uname}` : 'Someone'), view.profileType)
        : esc(view.displayName || (uname ? `@${uname}` : 'Someone'));
    const bioHtml =
      view.bio && !view.locked
        ? typeof linkifyText === 'function'
          ? linkifyText(view.bio)
          : esc(view.bio)
        : '';
    const aboutHtml =
      !view.locked && view.fields?.length
        ? `<dl class="public-profile-about">${view.fields
            .filter((f) => f.label !== 'Icebreaker' && f.label !== 'Conversation starter')
            .slice(0, 8)
            .map(
              (f) =>
                `<div class="public-profile-about-row"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`
            )
            .join('')}</dl>`
        : view.locked
          ? `<p class="public-profile-locked-note">${esc(view.visibilityLabel || 'Private profile')} — limited details</p>`
          : '';
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-public-profile-close' }) : '<button type="button" data-public-profile-close aria-label="Back" class="cp-back-btn">←</button>'}
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Profile</div>
        ${uname ? '<button type="button" data-public-profile-share aria-label="Share profile" style="background:none;border:none;font-size:18px;cursor:pointer;">↗</button>' : ''}
      </div>
      <div class="public-profile-scroll">
        <div class="public-profile-hero">
          <div data-public-profile-avatar class="public-profile-avatar">
            ${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml({...u,...view,uid:profileUid},{decorative:false,alt:view.displayName||u.name}):(view.photoURL||u.photoURL?`<img src="${esc(view.photoURL||u.photoURL)}" alt="">`:esc(u.avatar||'👤'))}
          </div>
          <div class="public-profile-name">${nameHtml}</div>
          ${uname ? `<div class="public-profile-uname">@${esc(uname)}</div>` : ''}
          ${bioHtml ? `<p class="public-profile-bio">${bioHtml}</p>` : ''}
          ${aboutHtml}
          ${
            ice.length
              ? `<div class="public-profile-prompts">${ice
                  .map((a) => {
                    const q =
                      a.customQuestion ||
                      (typeof getIcebreakerPromptById === 'function'
                        ? getIcebreakerPromptById(a.promptId)?.text
                        : null) ||
                      'Icebreaker';
                    return `<div class="public-profile-prompt"><span>${esc(q)}</span><p>${esc(a.answer)}</p></div>`;
                  })
                  .join('')}</div>`
              : ''
          }
          ${
            interests.length
              ? `<div class="public-profile-interests">${interests
                  .slice(0, 6)
                  .map((i) => `<span>${esc(i)}</span>`)
                  .join('')}</div>`
              : ''
          }
          <div data-public-profile-counts data-rel-counts-uid="${esc(profileUid)}" class="relationship-counts-loading public-profile-chrome-slot">
            <span class="public-profile-chrome-label">Connections</span>
          </div>
          <div class="public-profile-actions" data-rel-actions>
            <button class="btn btn--primary" data-rel-primary type="button">${String(dp.profileType || u.profileType || '').toLowerCase() === 'professional' ? 'Follow' : 'Add Friend'}</button>
            <button class="btn" data-rel-message type="button">Message</button>
            <button class="btn" data-rel-more type="button" aria-label="More">⋯</button>
          </div>
        </div>
        <div class="public-profile-shell-host" data-public-profile-shell></div>
        <div class="public-profile-ordered-sections" data-public-ordered-sections hidden></div>
      </div>`;
    const deviceEl = document.querySelector('.device');
    let profileLayer = null;
    const dismissProfile = () => {};
    if (typeof openLayer === 'function') {
      profileLayer = openLayer(sheet, dismissProfile, { host: deviceEl, remove: true });
    } else {
      deviceEl?.appendChild(sheet);
      if (typeof pushNavLayer === 'function') pushNavLayer(sheet, dismissProfile);
    }
    if (profileUid && !view.locked) {
      const sectionProfile = {
        ...(u.profile || {}),
        sectionOrder: u.profile?.sectionOrder || u.sectionOrder,
        customSections: u.profile?.customSections || u.customSections,
        tabOrder: u.profile?.tabOrder || u.tabOrder,
        profileMedia: media,
        bio: dp.bio,
        prompts: u.profile?.prompts || dp.prompts,
        icebreakers: dp.icebreakers,
        interests: dp.interests,
        hobbies: dp.hobbies,
        currentCity: u.profile?.currentCity || dp.currentCity,
        occupation: u.profile?.occupation || dp.occupation,
        lookingFor: u.profile?.lookingFor,
        relationshipStatus: u.profile?.relationshipStatus,
        languages: u.profile?.languages,
        diet: u.profile?.diet,
        drinking: u.profile?.drinking,
        smoking: u.profile?.smoking,
        fitness: u.profile?.fitness,
        website: u.profile?.website || dp.website,
        instagram: u.profile?.instagram || dp.instagram,
        profileLinks: u.profile?.profileLinks,
      };
      const shellHost = sheet.querySelector('[data-public-profile-shell]');
      if (typeof mountProfileShell === 'function' && shellHost) {
        mountProfileShell(shellHost, {
          uid: profileUid,
          profile: sectionProfile,
          view,
          editable: false,
          isOwner: !!(currentUser && currentUser.uid === profileUid),
          includeArchived: !!(currentUser && currentUser.uid === profileUid),
        });
      } else if (typeof mountOwnProfileSections === 'function') {
        mountOwnProfileSections(sheet.querySelector('[data-public-ordered-sections]'), {
          uid: profileUid,
          profile: sectionProfile,
          editable: false,
          isOwner: !!(currentUser && currentUser.uid === profileUid),
          includeArchived: !!(currentUser && currentUser.uid === profileUid),
        });
      }
    } else if (view.locked) {
      const host = sheet.querySelector('[data-public-profile-shell]') || sheet.querySelector('[data-public-ordered-sections]');
      if (host) host.innerHTML = '';
    }

    sheet.querySelector('[data-public-profile-close]')?.addEventListener('click', () => {
      if (profileLayer?.close) profileLayer.close();
      else {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
        sheet.remove();
      }
    });
    sheet.querySelector('[data-public-profile-share]')?.addEventListener('click', () => {
      const url = shareUrl('profile', uname);
      const display = u.name || uname;
      const stats =
        typeof buildShareStats === 'function'
          ? buildShareStats({
              scoreLine: `@${uname}`,
              caption: display,
              meta: view.bio ? String(view.bio).slice(0, 60) : 'on Chaupaal',
              text: `Check out @${uname} on Chaupaal`,
              url,
            })
          : {
              scoreLine: `@${uname}`,
              caption: display,
              meta: 'on Chaupaal',
              text: `Check out @${uname} on Chaupaal`,
              url,
            };
      if (typeof openUnifiedShareSheet === 'function') {
        openUnifiedShareSheet({
          gameId: 'profile',
          title: 'Share profile',
          subtitle: `@${uname}`,
          stats,
        });
      } else if (navigator.share) {
        navigator.share({ title: `@${uname} on Chaupaal`, url });
      } else {
        navigator.clipboard?.writeText(url).then(() => showToast('Link copied'));
      }
    });
    sheet.querySelectorAll('[data-voice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof playVoiceNote === 'function') playVoiceNote(btn.dataset.voice);
      });
    });
    sheet.querySelectorAll('[data-ppm-video]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.querySelector('video');
        if (!v) return;
        if (v.paused) {
          v.muted = false;
          v.play().catch(() => {});
          btn.classList.add('is-playing');
        } else {
          v.pause();
          btn.classList.remove('is-playing');
        }
      });
    });
    const avatarEl = sheet.querySelector('[data-public-profile-avatar]');
    if (profileUid && typeof bindProfileLongPress === 'function') bindProfileLongPress(avatarEl, { ...u, uid: profileUid });
    if (profileUid && typeof openProfileStories === 'function') avatarEl?.addEventListener('click', () => openProfileStories(profileUid));
    if (profileUid && typeof storyCall === 'function') {
      storyCall('profile', { targetUid: profileUid })
        .then((data) => {
          const count = (data.stories?.duniya?.length || 0) + (data.stories?.baithak?.length || 0);
          avatarEl?.classList.toggle('profile-avatar-has-story', count > 0);
        })
        .catch(() => {});
      storyCall('list_highlights', { targetUid: profileUid })
        .then((data) => {
          const row = sheet.querySelector('[data-highlights-row]');
          const highlights = data.highlights || [];
          if (!row) return;
          if (!highlights.length) {
            row.innerHTML = '<span class="public-profile-highlights-empty">No highlights yet</span>';
            return;
          }
          row.innerHTML = highlights
            .map(
              (h) =>
                `<button type="button" class="highlight-circle" data-highlight-id="${h.id}" title="${h.title}">
                  ${h.coverUrl ? `<img src="${h.coverUrl}" alt="">` : '<span>◎</span>'}
                  <small>${h.title}</small>
                </button>`
            )
            .join('');
          row.querySelectorAll('[data-highlight-id]').forEach((btn) => {
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
        })
        .catch(() => {
          const row = sheet.querySelector('[data-highlights-row]');
          if (row) row.innerHTML = '<span class="public-profile-highlights-empty">Highlights unavailable</span>';
        });
    }
    if (profileUid && db) {
      const duniyaEl = sheet.querySelector('[data-public-duniya-posts]');
      const peepalEl = sheet.querySelector('[data-public-peepal-posts]');
      db.collection('duniya')
        .where('uid', '==', profileUid)
        .limit(24)
        .get()
        .then((snap) => {
          const posts = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => !p.deleted && p.archived !== true);
          if (!duniyaEl) return;
          if (!posts.length) {
            duniyaEl.innerHTML = '<div class="public-profile-posts-empty">No public Duniya posts</div>';
            return;
          }
          duniyaEl.innerHTML = posts
            .slice(0, 12)
            .map((p) => {
              const media = p.thumb || p.media || '';
              return `<div class="public-profile-post-cell">${media ? `<img src="${media}" alt="">` : `<span>${(p.caption || '').slice(0, 40)}</span>`}</div>`;
            })
            .join('');
        })
        .catch(() => {
          if (duniyaEl) duniyaEl.innerHTML = '<div class="public-profile-posts-empty">Posts unavailable</div>';
        });
      db.collection('peepal')
        .where('uid', '==', profileUid)
        .limit(24)
        .get()
        .then((snap) => {
          const posts = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => !p.deleted && p.archived !== true);
          if (!peepalEl) return;
          if (!posts.length) {
            peepalEl.innerHTML = '<div class="public-profile-posts-empty">No public Peepal posts</div>';
            return;
          }
          peepalEl.innerHTML = posts
            .slice(0, 8)
            .map((p) => `<div class="public-profile-peepal-card"><strong>${p.tag || 'Peepal'}</strong><p>${(p.question || '').slice(0, 120)}</p></div>`)
            .join('');
        })
        .catch(() => {
          if (peepalEl) peepalEl.innerHTML = '<div class="public-profile-posts-empty">Posts unavailable</div>';
        });
    }
    const visitContext = context === 'peepal' || context === 'duniya' ? context : 'profile';
    const relProfile = {
      ...u,
      uid: profileUid,
      profileType: u.profileType || u.profile?.profileType || 'personal',
      name: u.name || (uname ? `@${uname}` : 'Someone'),
    };
    if (profileUid && typeof wireProfileRelationshipActions === 'function') {
      wireProfileRelationshipActions(sheet.querySelector('[data-rel-actions]'), relProfile, {
        context: visitContext,
      });
    }
    if (profileUid && typeof loadRelationshipProfile === 'function') {
      const countsEl = sheet.querySelector('[data-public-profile-counts]');
      if (countsEl && typeof renderSkeleton === 'function') {
        const skWrap = document.createElement('div');
        countsEl.appendChild(skWrap);
        renderSkeleton(skWrap, { variant: 'detail', count: 1 });
      }
      loadRelationshipProfile(profileUid)
        .then((data) => {
          const counts = sheet.querySelector('[data-public-profile-counts]');
          if (counts && typeof paintRelationshipCounts === 'function') {
            paintRelationshipCounts(counts, data.counts, profileUid);
          } else if (counts) {
            counts.innerHTML = relationshipCountsHtml(data.counts);
            if (typeof wireRelationshipCountButtons === 'function') {
              wireRelationshipCountButtons(counts, { targetUid: profileUid });
            }
          }
        })
        .catch((err) => {
          const counts = sheet.querySelector('[data-public-profile-counts]');
          if (counts && typeof renderErrorState === 'function') {
            renderErrorState(counts, {
              message: typeof friendlyError === 'function' ? friendlyError(err) : 'Could not load counts',
              onRetry: () => loadRelationshipProfile(profileUid).then((data) => {
                if (typeof paintRelationshipCounts === 'function') paintRelationshipCounts(counts, data.counts, profileUid);
              }),
            });
          } else if (counts) {
            counts.innerHTML = '<span class="public-profile-chrome-label">Connections</span>';
          }
        });
    }
    return sheet;
  }

  async function openProfileByUsername(username) {
    const uname = String(username || '')
      .replace(/^@/, '')
      .toLowerCase();
    if (!uname) return;
    switchTab('peepal');
    if (!db) {
      if (typeof showToast === 'function') showToast(`@${uname}`);
      return;
    }
    try {
      const snap = await db.collection('usernames').doc(uname).get();
      if (!snap.exists) {
        if (typeof showToast === 'function') showToast(`@${uname} not found`);
        return;
      }
      const uid = snap.data().uid;
      const u =
        (typeof UsersPublic?.getPublicProfile === 'function'
          ? await UsersPublic.getPublicProfile(uid)
          : null) || {};
      openPublicProfile({ ...u, uid }, { uid, username: uname });
      return;
      // Lightweight profile sheet (full public profile UI can expand later)
      const sheet = document.createElement('div');
      sheet.className = 'archive-overlay';
      sheet.innerHTML = `
        <div class="archive-header">
          ${typeof backButtonHtml==='function'?backButtonHtml({ id: 'dlProfBack' }):'<button id="dlProfBack" class="cp-back-btn" aria-label="Back"></button>'}
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Profile</div>
          <button id="dlProfShare" style="background:none;border:none;font-size:18px;cursor:pointer;">↗</button>
        </div>
        <div style="padding:24px 16px;text-align:center;">
          <div style="width:88px;height:88px;border-radius:50%;margin:0 auto 12px;background:var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:40px;">
            ${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml(u,{decorative:true}):(u.photoURL?`<img src="${u.photoURL}" style="width:100%;height:100%;object-fit:cover;">`:'👤')}
          </div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:20px;">${u.name || uname}</div>
          <div style="color:var(--muted);font-size:13px;margin-bottom:8px;">@${uname}</div>
          <div style="font-size:13px;color:var(--muted);">${u.city || u.profile?.currentCity || ''}</div>
          <div style="font-size:14px;margin-top:14px;line-height:1.5;">${u.profile?.bio || u.bio || ''}</div>
          <button class="btn btn--primary ui-state-btn ui-state-btn-primary" id="dlSayHi" style="margin-top:20px;">💬 Say hi</button>
        </div>`;
      document.querySelector('.device')?.appendChild(sheet);
      sheet.querySelector('#dlProfBack')?.addEventListener('click', () => {
        sheet.remove();
        history.pushState({}, '', '/');
      });
      sheet.querySelector('#dlProfShare')?.addEventListener('click', () => {
        const url = shareUrl('profile', uname);
        const display = u.name || uname;
        const stats =
          typeof buildShareStats === 'function'
            ? buildShareStats({
                scoreLine: `@${uname}`,
                caption: display,
                meta: (u.profile?.bio || u.bio || 'on Chaupaal').toString().slice(0, 60),
                text: `Check out @${uname} on Chaupaal`,
                url,
              })
            : {
                scoreLine: `@${uname}`,
                caption: display,
                meta: 'on Chaupaal',
                text: `Check out @${uname} on Chaupaal`,
                url,
              };
        if (typeof openUnifiedShareSheet === 'function') {
          openUnifiedShareSheet({
            gameId: 'profile',
            title: 'Share profile',
            subtitle: `@${uname}`,
            stats,
          });
        } else if (navigator.share) {
          navigator.share({ title: `@${uname} on Chaupaal`, url });
        } else {
          navigator.clipboard.writeText(url).then(() => showToast('Link copied'));
        }
      });
      sheet.querySelector('#dlSayHi')?.addEventListener('click', async () => {
        sheet.remove();
        const display = u.name || u.displayName || '';
        if (typeof openDmWithSharedHello === 'function') {
          await openDmWithSharedHello({
            uid,
            name: display || uname,
            username: uname,
            photoURL: u.photoURL || '',
            avatar: u.photoURL || '👤',
            origin: 'deeplink_profile',
          });
          return;
        }
        if (typeof bootstrapDmChat === 'function') {
          try {
            const chat = await bootstrapDmChat({
              uid,
              name: display || uname,
              username: uname,
              photoURL: u.photoURL || '',
              origin: 'deeplink_profile',
            });
            if (chat && typeof openChatScreen === 'function') {
              switchTab('baithak');
              setTimeout(() => openChatScreen(chat), 80);
            }
          } catch (e) {
            if (typeof showToast === 'function') showToast('Could not open chat');
          }
          return;
        }
        if (typeof showToast === 'function') showToast('Sign in to message');
      });
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast(typeof friendlyError === 'function' ? friendlyError(e) : 'Could not open profile');
      }
    }
  }

  async function openPostById(id) {
    if (!id) return;
    // Try peepal local → duniya local → firestore peepal → firestore duniya
    const localP =
      typeof peepalQuestions !== 'undefined' ? peepalQuestions.find((q) => q.id === id || q.firestoreId === id) : null;
    if (localP) {
      switchTab('peepal');
      setTimeout(() => {
        if (typeof openPeepalDetail === 'function') openPeepalDetail(localP);
      }, 200);
      return;
    }
    const localD =
      typeof duniyaPosts !== 'undefined' ? duniyaPosts.find((p) => p.id === id || p.firestoreId === id) : null;
    if (localD) {
      switchTab('duniya');
      setTimeout(() => {
        if (typeof initDuniya === 'function') initDuniya();
        if (typeof openDuniyaDetail === 'function') openDuniyaDetail(localD);
      }, 200);
      return;
    }
    if (db) {
      try {
        let snap = await db.collection('peepal').doc(id).get();
        if (snap.exists) {
          switchTab('peepal');
          const q = { id: snap.id, firestoreId: snap.id, ...snap.data() };
          setTimeout(() => openPeepalDetail?.(q), 200);
          return;
        }
        snap = await db.collection('duniya').doc(id).get();
        if (snap.exists) {
          switchTab('duniya');
          const raw = { id: snap.id, firestoreId: snap.id, ...snap.data() };
          const p = typeof mapDuniyaDoc === 'function' ? mapDuniyaDoc(raw) : raw;
          setTimeout(() => {
            initDuniya?.();
            openDuniyaDetail?.(p);
          }, 200);
          return;
        }
      } catch (e) {}
    }
    if (typeof showToast === 'function') showToast('Post not found');
  }

  async function openChatById(id, opts) {
    if (!id) return;
    const wantMehfil = !!(opts && opts.mehfil) || (() => {
      try {
        return new URLSearchParams(location.search).get('mehfil') === '1';
      } catch (e) {
        return false;
      }
    })();
    // Already open on this chat — do not pushState / remount (breaks Back after overlays/music)
    const open = document.getElementById('activeChatScreen');
    const openId = open?.dataset?.chatId || window.currentOpenChat?.firestoreId || window.currentOpenChat?.id;
    if (open && openId && String(openId) === String(id)) return;

    switchTab('baithak');
    const local =
      typeof baithakChats !== 'undefined'
        ? baithakChats.find((c) => c.id === id || c.firestoreId === id)
        : typeof SAMPLE_CHATS !== 'undefined'
          ? SAMPLE_CHATS.find((c) => c.id === id)
          : null;
    setTimeout(() => {
      if (typeof initBaithak === 'function') initBaithak();
      const chat = local || { id, type: 'dm', name: 'Chat', avatar: '💬', preview: '', time: '', unread: 0 };
      // Re-check after delay — user may have closed meanwhile
      const still = document.getElementById('activeChatScreen');
      const stillId = still?.dataset?.chatId;
      if (still && stillId && String(stillId) === String(id)) return;
      setTimeout(() => {
        openChatScreen?.(chat);
        if (wantMehfil && typeof openMehfil === 'function' && currentUser) {
          if (typeof mehfilEligible === 'function' && !mehfilEligible(chat)) return;
          if (typeof isMehfilOpen === 'function' && isMehfilOpen()) return;
          setTimeout(() => openMehfil(chat), 500);
        }
      }, 250);
    }, 100);
  }

  async function openGroupInvite(token) {
    if (!token || typeof joinGroupByInviteToken !== 'function') return;
    switchTab('baithak');
    setTimeout(async () => {
      if (typeof initBaithak === 'function') initBaithak();
      const result = await joinGroupByInviteToken(token);
      if (result?.pending && typeof showToast === 'function') {
        showToast('Join request sent — waiting for admin approval');
      } else if (result?.ok && result.chat && typeof openChatScreen === 'function') {
        openChatScreen(result.chat);
        if (typeof showToast === 'function') showToast(result.already ? 'Already in this group' : 'Joined group');
      } else if (typeof showToast === 'function') {
        showToast('Invite link invalid or expired');
      }
    }, 200);
  }

  async function handleDeepLink(route) {
    if (!route) return false;
    try {
      if (typeof TabHabits !== 'undefined' && TabHabits.markOverride) {
        TabHabits.markOverride('deeplink:' + route.name);
      }
    } catch (e) {}
    if (route.name === 'profile') await openProfileByUsername(route.id);
    else if (route.name === 'post') await openPostById(route.id);
    else if (route.name === 'chat') await openChatById(route.id);
    else if (route.name === 'join') await openGroupInvite(route.id);
    else if (route.name === 'story') {
      switchTab('duniya');
      if (typeof DuniyaStory !== 'undefined' && DuniyaStory.openById) await DuniyaStory.openById(route.id);
    }
    return true;
  }

  function initDeepLinks() {
    window.addEventListener('popstate', () => {
      if (typeof hasNavLayers === 'function' && hasNavLayers()) return;

      const route = parseDeepLink(location.pathname);
      const chatOpen = !!document.getElementById('activeChatScreen');

      // Still on /chat/… after dismissing a layer (e.g. music seek UI desync) —
      // do NOT reopen; wait for the next Back to leave the deep route.
      if (route?.name === 'chat' && chatOpen) {
        const openId =
          document.getElementById('activeChatScreen')?.dataset?.chatId ||
          window.currentOpenChat?.firestoreId ||
          window.currentOpenChat?.id;
        if (openId && String(openId) === String(route.id)) return;
      }

      if (route) {
        handleDeepLink(route);
        return;
      }
      // Left a deep route (browser/phone back) — same cleanup as explicit close
      if (typeof closeChatScreen === 'function' && chatOpen) {
        closeChatScreen({ fromHistory: true, updateHistory: false, animate: true });
      }
      if (typeof closeAiKeyboard === 'function') closeAiKeyboard();
      // Detail panels that push history
      const peepalDetail = document.getElementById('peepalDetail');
      if (peepalDetail && peepalDetail.classList.contains('open')) {
        peepalDetail.classList.remove('open');
        setTimeout(() => peepalDetail.classList.add('hidden'), 300);
      }
      const duniyaDetail = document.getElementById('duniyaPostDetail');
      if (duniyaDetail && duniyaDetail.classList.contains('open')) {
        duniyaDetail.classList.remove('open');
        setTimeout(() => duniyaDetail.classList.add('hidden'), 300);
      }
    });
    // Defer until app chrome is ready
    setTimeout(() => {
      const route = parseDeepLink();
      if (route) handleDeepLink(route);
      // Also keep legacy viral challenge query handler
      if (typeof checkViralLink === 'function') checkViralLink();
    }, 900);
  }

  // Patch share helpers on Duniya if present
  window.parseDeepLink = parseDeepLink;
  window.buildDeepLink = buildDeepLink;
  window.shareUrl = shareUrl;
  window.navigateToDeepLink = navigateToDeepLink;
  window.openPublicProfile = openPublicProfile;
  window.handleDeepLink = handleDeepLink;
  window.initDeepLinks = initDeepLinks;
})();
