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
    return null;
  }

  function buildDeepLink(name, id) {
    const safe = encodeURIComponent(String(id || '').replace(/^@/, ''));
    if (name === 'profile') return `/profile/${safe}`;
    if (name === 'post') return `/post/${safe}`;
    if (name === 'chat') return `/chat/${safe}`;
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

  function openPublicProfile(user, { uid, username, context = 'duniya' } = {}) {
    const u = user || {};
    const profileUid = uid || u.uid || '';
    const uname = String(username || u.username || '').replace(/^@/, '');
    const existing = document.getElementById('publicProfileSheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.id = 'publicProfileSheet';
    sheet.className = 'archive-overlay';
    const interests = [...new Set([...(u.interests || []), u.topCat].filter(Boolean))];
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-public-profile-close aria-label="Back" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Profile</div>
        ${uname ? '<button type="button" data-public-profile-share aria-label="Share profile" style="background:none;border:none;font-size:18px;cursor:pointer;">↗</button>' : ''}
      </div>
      <div style="padding:24px 16px;text-align:center;overflow-y:auto;">
        <div data-public-profile-avatar style="width:88px;height:88px;border-radius:50%;margin:0 auto 12px;background:var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:40px;cursor:pointer;">
          ${u.photoURL ? `<img src="${u.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;">` : (u.avatar || '👤')}
        </div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:20px;">${u.name || uname || 'Chaupaal member'}</div>
        ${uname ? `<div style="color:var(--muted);font-size:13px;margin-bottom:8px;">@${uname}</div>` : ''}
        <div style="font-size:13px;color:var(--muted);">${[u.city || u.profile?.currentCity, u.personality].filter(Boolean).join(' · ')}</div>
        <div style="font-size:14px;margin-top:14px;line-height:1.5;">${u.profile?.bio || u.bio || 'Open to a good conversation.'}</div>
        ${interests.length ? `<div style="display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:16px;">${interests.slice(0,6).map((i) => `<span class="discovery-shared-tag">📌 ${i}</span>`).join('')}</div>` : ''}
        <div data-public-profile-counts class="relationship-counts-loading">Loading relationships…</div>
        <div class="public-profile-actions">
          ${context==='peepal'
            ?'<button class="btn btn--primary" data-public-profile-friend>Add Friend</button><button class="btn" data-public-profile-follow>Follow</button>'
            :'<button class="btn btn--primary" data-public-profile-follow>Follow</button><button class="btn" data-public-profile-friend>Add Friend</button>'}
          <button class="btn" data-public-profile-hi>💬 Say hi</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    sheet.querySelector('[data-public-profile-close]')?.addEventListener('click', () => sheet.remove());
    sheet.querySelector('[data-public-profile-share]')?.addEventListener('click', () => {
      const url = shareUrl('profile', uname);
      if (navigator.share) navigator.share({ title: `@${uname} on Chaupaal`, url });
      else navigator.clipboard?.writeText(url).then(() => showToast('Link copied'));
    });
    const avatarEl=sheet.querySelector('[data-public-profile-avatar]');
    if(profileUid&&typeof bindProfileLongPress==='function') bindProfileLongPress(avatarEl,{...u,uid:profileUid});
    if(profileUid&&typeof openProfileStories==='function') avatarEl?.addEventListener('click',()=>openProfileStories(profileUid));
    if(profileUid&&typeof storyCall==='function'){
      storyCall('profile',{targetUid:profileUid}).then(data=>{
        const count=(data.stories?.duniya?.length||0)+(data.stories?.baithak?.length||0);
        avatarEl?.classList.toggle('profile-avatar-has-story',count>0);
      }).catch(()=>{});
    }
    if(profileUid&&typeof loadRelationshipProfile==='function'){
      loadRelationshipProfile(profileUid).then((data)=>{
        const counts=sheet.querySelector('[data-public-profile-counts]');
        if(counts) counts.innerHTML=relationshipCountsHtml(data.counts);
        const follow=sheet.querySelector('[data-public-profile-follow]');
        const paintFollow=()=>{
          const state=relationshipState(profileUid);
          follow.textContent=state.following?'Following':'Follow';
          follow.classList.toggle('is-connected',state.following);
        };
        paintFollow();
        follow?.addEventListener('click',async()=>{
          follow.disabled=true;
          try{await setFollowing(profileUid,!relationshipState(profileUid).following,'public_profile');paintFollow();}
          finally{follow.disabled=false;}
        });
        wireFriendAction(sheet.querySelector('[data-public-profile-friend]'),profileUid);
      }).catch(()=>{});
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
        if (navigator.share) navigator.share({ title: `@${uname} on Chaupaal`, url });
        else navigator.clipboard.writeText(url).then(() => showToast('Link copied'));
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
      setTimeout(() => openChatScreen?.(chat), 250);
    }, 100);
  }

  async function handleDeepLink(route) {
    if (!route) return false;
    if (route.name === 'profile') await openProfileByUsername(route.id);
    else if (route.name === 'post') await openPostById(route.id);
    else if (route.name === 'chat') await openChatById(route.id);
    return true;
  }

  function initDeepLinks() {
    window.addEventListener('popstate', () => {
      const route = parseDeepLink(location.pathname);
      if (route) {
        handleDeepLink(route);
        return;
      }
      // Left a deep route (browser/phone back) — same cleanup as explicit close
      if (typeof closeChatScreen === 'function' && document.getElementById('activeChatScreen')) {
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
