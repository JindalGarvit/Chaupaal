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
          <button class="ui-state-btn ui-state-btn-primary" id="dlSayHi" style="margin-top:20px;">💬 Say hi</button>
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
      if (route) handleDeepLink(route);
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
  window.handleDeepLink = handleDeepLink;
  window.initDeepLinks = initDeepLinks;
})();
