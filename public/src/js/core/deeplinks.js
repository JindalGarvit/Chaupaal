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
    { name: 'join', re: /^\/(?:join|g)\/([^/?#]+)\/?$/i },
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
    const existing = document.getElementById('publicProfileSheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'publicProfileSheet';
    sheet.className = 'archive-overlay';
    const profile = u.profile || {};
    const interests = [
      ...new Set([...(profile.interests || u.interests || []), ...(profile.hobbies || []).slice(0, 4), u.topCat].filter(Boolean)),
    ];
    const prompts = Array.isArray(profile.prompts) ? profile.prompts : Array.isArray(u.prompts) ? u.prompts : [];
    const media = Array.isArray(profile.profileMedia) ? profile.profileMedia : Array.isArray(u.profileMedia) ? u.profileMedia : [];
    const bio = profile.bio || u.bio || '';
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-public-profile-close aria-label="Back" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Profile</div>
        ${uname ? '<button type="button" data-public-profile-share aria-label="Share profile" style="background:none;border:none;font-size:18px;cursor:pointer;">↗</button>' : ''}
      </div>
      <div class="public-profile-scroll">
        <div class="public-profile-hero">
          <div data-public-profile-avatar class="public-profile-avatar">
            ${u.photoURL ? `<img src="${u.photoURL}" alt="">` : (u.avatar || '👤')}
          </div>
          <div class="public-profile-name">${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(u.name || profile.displayName || uname || 'Chaupaal member', u.profileType || profile.profileType) : (u.name || profile.displayName || uname || 'Chaupaal member')}</div>
          ${uname ? `<div class="public-profile-uname">@${uname}</div>` : ''}
          ${bio ? `<p class="public-profile-bio">${typeof linkifyText === 'function' ? linkifyText(bio) : bio}</p>` : ''}
          ${
            prompts.length
              ? `<div class="public-profile-prompts">${prompts
                  .slice(0, 3)
                  .map((a) => `<div class="public-profile-prompt"><span>${(a.customQuestion || 'Prompt')}</span><p>${a.answer || ''}</p></div>`)
                  .join('')}</div>`
              : ''
          }
          ${
            interests.length
              ? `<div class="public-profile-interests">${interests
                  .slice(0, 8)
                  .map((i) => `<span>${i}</span>`)
                  .join('')}</div>`
              : ''
          }
          <div data-public-profile-counts class="relationship-counts-loading public-profile-chrome-slot">
            <span class="public-profile-chrome-label">Connections</span>
            <span>Loading…</span>
          </div>
          <div class="public-profile-actions" data-rel-actions>
            <button class="btn btn--primary" data-rel-primary type="button">Connect</button>
            <button class="btn" data-rel-more type="button" aria-label="More relationship options">▾</button>
            <button class="btn" data-public-profile-hi type="button">Say hi</button>
          </div>
        </div>
        <div class="public-profile-ordered-sections" data-public-ordered-sections></div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    if (typeof mountOwnProfileSections === 'function' && profileUid) {
      const sectionProfile = {
        ...(profile || {}),
        sectionOrder: profile.sectionOrder || u.sectionOrder,
        customSections: profile.customSections || u.customSections,
        profileMedia: media,
      };
      mountOwnProfileSections(sheet.querySelector('[data-public-ordered-sections]'), {
        uid: profileUid,
        profile: sectionProfile,
        editable: false,
        isOwner: !!(currentUser && currentUser.uid === profileUid),
        includeArchived: !!(currentUser && currentUser.uid === profileUid),
      });
    }

    sheet.querySelector('[data-public-profile-close]')?.addEventListener('click', () => sheet.remove());
    sheet.querySelector('[data-public-profile-share]')?.addEventListener('click', () => {
      const url = shareUrl('profile', uname);
      const display = u.name || uname;
      const stats =
        typeof buildShareStats === 'function'
          ? buildShareStats({
              scoreLine: `@${uname}`,
              caption: display,
              meta: bio ? String(bio).slice(0, 60) : 'on Chaupaal',
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
    if (profileUid && typeof loadRelationshipProfile === 'function') {
      loadRelationshipProfile(profileUid)
        .then((data) => {
          const counts = sheet.querySelector('[data-public-profile-counts]');
          if (counts) {
            counts.innerHTML = relationshipCountsHtml(data.counts);
            if (typeof wireRelationshipCountButtons === 'function') {
              wireRelationshipCountButtons(counts, { targetUid: profileUid });
            }
          }
          const relProfile = {
            ...u,
            uid: profileUid,
            profileType: data.profile?.profileType || u.profileType || u.profile?.profileType || 'personal',
            name: data.profile?.name || u.name || uname || 'Chaupaal member',
          };
          const visitContext = context === 'peepal' || context === 'duniya' ? context : 'profile';
          if (typeof wireProfileRelationshipActions === 'function') {
            wireProfileRelationshipActions(sheet.querySelector('[data-rel-actions]'), relProfile, {
              context: visitContext,
            });
          }
        })
        .catch(() => {});
    }
    sheet.querySelector('[data-public-profile-hi]')?.addEventListener('click', () => {
      sheet.remove();
      const chat = {
        id: `chat_profile_${profileUid || uname}`,
        type: 'dm',
        name: u.name || uname || 'Chaupaal member',
        avatar: u.avatar || '👤',
        preview: 'Opened from discovery',
        time: 'now',
        unread: 0,
        theirIcebreakers: u.icebreakers || [],
      };
      if (typeof SAMPLE_CHATS !== 'undefined' && !SAMPLE_CHATS.find((c) => c.id === chat.id)) SAMPLE_CHATS.unshift(chat);
      switchTab('baithak');
      setTimeout(() => {
        if (typeof initBaithak === 'function') initBaithak();
        setTimeout(() => window.openChatScreen?.(chat), 200);
      }, 100);
    });
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
      const userSnap = await db.collection('users').doc(uid).get();
      const u = userSnap.data() || {};
      openPublicProfile({ ...u, uid }, { uid, username: uname });
      return;
      // Lightweight profile sheet (full public profile UI can expand later)
      const sheet = document.createElement('div');
      sheet.className = 'archive-overlay';
      sheet.innerHTML = `
        <div class="archive-header">
          <button id="dlProfBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Profile</div>
          <button id="dlProfShare" style="background:none;border:none;font-size:18px;cursor:pointer;">↗</button>
        </div>
        <div style="padding:24px 16px;text-align:center;">
          <div style="width:88px;height:88px;border-radius:50%;margin:0 auto 12px;background:var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:40px;">
            ${u.photoURL ? `<img src="${u.photoURL}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
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
      sheet.querySelector('#dlSayHi')?.addEventListener('click', () => {
        sheet.remove();
        const chat = {
          id: `chat_dl_${uid}`,
          type: 'dm',
          name: u.name || uname,
          avatar: '👤',
          preview: 'Opened from profile link',
          time: 'now',
          unread: 0,
        };
        if (typeof SAMPLE_CHATS !== 'undefined' && !SAMPLE_CHATS.find((c) => c.id === chat.id)) {
          SAMPLE_CHATS.unshift(chat);
        }
        switchTab('baithak');
        setTimeout(() => {
          if (typeof initBaithak === 'function') initBaithak();
          setTimeout(() => openChatScreen(chat), 200);
        }, 100);
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
          const p = { id: snap.id, firestoreId: snap.id, ...snap.data() };
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

  async function openChatById(id) {
    if (!id) return;
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
      setTimeout(() => openChatScreen?.(chat), 250);
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
    if (route.name === 'profile') await openProfileByUsername(route.id);
    else if (route.name === 'post') await openPostById(route.id);
    else if (route.name === 'chat') await openChatById(route.id);
    else if (route.name === 'join') await openGroupInvite(route.id);
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
