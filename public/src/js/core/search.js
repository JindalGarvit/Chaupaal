/**
 * Unified global search — LinkedIn/IG verticals (All · Log · Personal · Professional · …).
 *
 * Peepal morph #5 opens this omnibox. Khoj remains intent-based people discovery only.
 */
(function () {
  /** @type {Record<string, (query: string, opts: object) => Promise<object[]>>} */
  const providers = {};
  const SEARCH_HISTORY_KEY = 'chaupaal_search_history';
  const SEARCH_HISTORY_LIMIT = 8;

  /** Initial rows per category; “See more” expands to SEE_MORE_LIMIT. */
  const CATEGORY_PREVIEW = 5;
  const SEE_MORE_LIMIT = 20;

  const GLOBAL_TYPES = ['users', 'duniya', 'peepal', 'groups', 'games'];
  /** Vertical tabs — All mixes keyword hits; Log = people; Personal/Professional split profiles. */
  const VERTICAL_ORDER = ['all', 'log', 'personal', 'professional', 'duniya', 'peepal', 'groups', 'games'];

  const CATEGORY_META = {
    all: { label: 'All', empty: 'No matches' },
    log: { label: 'Log', empty: 'No people matched' },
    personal: { label: 'Personal', empty: 'No Personal profiles matched' },
    professional: { label: 'Professional', empty: 'No Professional profiles matched' },
    users: { label: 'Log', empty: 'No people matched' },
    duniya: { label: 'Duniya', empty: 'No Duniya posts matched' },
    peepal: { label: 'Peepal', empty: 'No Peepal posts matched' },
    groups: { label: 'Baithak', empty: 'No public groups matched' },
    games: { label: 'Dangal', empty: 'No games matched' },
  };

  function loadSearchHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter((q) => typeof q === 'string' && q.trim()).slice(0, SEARCH_HISTORY_LIMIT)
        : [];
    } catch (e) {
      return [];
    }
  }

  function rememberSearch(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const next = [q, ...loadSearchHistory().filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(
      0,
      SEARCH_HISTORY_LIMIT
    );
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function clearSearchHistory() {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (e) {}
  }

  function escapeSearchHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function registerSearchProvider(type, fn) {
    if (typeof fn === 'function') providers[type] = fn;
  }

  function endPrefix(q) {
    return q + '\uf8ff';
  }

  function normalizeQuery(raw) {
    return String(raw || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
  }

  function textHaystack(...parts) {
    return parts
      .filter(Boolean)
      .map((p) => String(p).toLowerCase())
      .join(' ');
  }

  function isHiddenFromDiscovery(u) {
    return !!(u && u.hiddenFromDiscovery);
  }

  function mapUserResult(uid, u, usernameFallback) {
    return {
      type: 'user',
      category: 'users',
      id: uid,
      uid,
      username: u.username || usernameFallback || '',
      name: u.name || usernameFallback || '',
      photoURL: u.photoURL || u.photoThumb || null,
      city: u.city || u.profile?.currentCity || '',
      bio: u.bio || u.profile?.bio || '',
      profileType: u.profileType || u.profile?.profileType || 'personal',
      subtitle: [u.city || u.profile?.currentCity, (u.interests || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
      score: 0,
    };
  }

  /** Profiles: exact username + users_public name/username prefix + bio text boost. */
  async function searchUsersProvider(query, { limit = SEE_MORE_LIMIT } = {}) {
    const q = normalizeQuery(query);
    if (!q || q.length < 1) return [];
    const results = [];
    const seen = new Set();

    function pushUser(uid, u, usernameFallback, scoreBoost) {
      if (!uid || seen.has(uid) || isHiddenFromDiscovery(u)) return;
      seen.add(uid);
      const row = mapUserResult(uid, u, usernameFallback);
      const hay = textHaystack(row.name, row.username, row.bio, row.city, ...(u.interests || []));
      let score = scoreBoost || 0;
      const uname = String(row.username || '').toLowerCase();
      const dname = String(row.name || '').toLowerCase();
      // Exact / strong identity matches always win ranking.
      if (uname === q) score += 500;
      else if (uname.startsWith(q)) score += 200;
      else if (uname.includes(q)) score += 80;
      if (dname === q) score += 450;
      else if (dname.startsWith(q)) score += 160;
      else if (dname.includes(q)) score += 50;
      if (hay.includes(q)) score += 15;
      // Soft signal from discovery / openToMeet when present
      if (u.openToMeet) score += 5;
      row.score = score;
      results.push(row);
    }

    if (!db) {
      const pool = typeof SAMPLE_DISCOVERY_POOL !== 'undefined' ? SAMPLE_DISCOVERY_POOL : [];
      return pool
        .filter((u) => {
          if (isHiddenFromDiscovery(u)) return false;
          const un = String(u.username || u.name || '')
            .toLowerCase()
            .replace(/\s+/g, '_');
          const nm = String(u.name || '').toLowerCase();
          return un.includes(q) || nm.includes(q);
        })
        .map((u) => {
          const row = mapUserResult(u.uid, u);
          const uname = String(row.username || '').toLowerCase();
          const dname = String(row.name || '').toLowerCase();
          let score = 0;
          if (uname === q) score += 500;
          else if (uname.startsWith(q)) score += 200;
          else if (uname.includes(q)) score += 80;
          if (dname === q) score += 450;
          else if (dname.startsWith(q)) score += 160;
          else if (dname.includes(q)) score += 50;
          row.score = score;
          return row;
        })
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);
    }

    // 1) Exact username (usernames list is denied by rules — get-by-id only)
    try {
      const exact = await db.collection('usernames').doc(q).get();
      if (exact.exists) {
        const uid = exact.data()?.uid;
        if (uid) {
          const u =
            (typeof UsersPublic?.getPublicProfile === 'function'
              ? await UsersPublic.getPublicProfile(uid)
              : (await db.collection('users_public').doc(uid).get()).data()) || {};
          pushUser(uid, u, q, 100);
        }
      }
    } catch (e) {}

    // 2) usernameLower / nameLower prefix on users_public (no usernames list)
    async function prefixField(field) {
      if (results.length >= limit) return;
      try {
        const snap = await db
          .collection('users_public')
          .orderBy(field)
          .startAt(q)
          .endAt(endPrefix(q))
          .limit(limit)
          .get();
        snap.docs.forEach((doc) => {
          if (results.length >= limit) return;
          pushUser(doc.id, doc.data() || {}, doc.data()?.username || '', field === 'usernameLower' ? 50 : 35);
        });
      } catch (e) {
        console.warn('[search] users_public', field, e?.message || e);
      }
    }

    await prefixField('usernameLower');
    await prefixField('nameLower');

    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return results.slice(0, limit);
  }

  function postEngagementScore(raw, q) {
    const likes = Number(raw.likes || raw.likeCount || 0);
    const comments = Number(raw.comments || raw.commentCount || raw.totalResponses || 0);
    const shares = Number(raw.shares || 0);
    const ts = raw.ts || raw.createdAt?.toMillis?.() || 0;
    const ageHours = ts ? Math.max(0, (Date.now() - ts) / 3600000) : 72;
    const recency = Math.max(0, 48 - ageHours);
    const text = textHaystack(raw.caption, raw.question, raw.text, ...(raw.tags || []));
    let score = likes * 2 + comments * 3 + shares + recency;
    if (text.includes(q)) score += 40;
    if (text.startsWith(q)) score += 20;
    return score;
  }

  function isPostVisibleClient(raw, kind) {
    if (!raw) return false;
    if (raw.deleted === true) return false;
    if (raw.archived === true) return false;
    if (kind === 'duniya') {
      const audience = raw.audience || 'public';
      if (audience === 'public') return true;
      if (currentUser?.uid && raw.uid === currentUser.uid) return true;
      // followers/friends: rules already gate list reads; if we got the doc, trust rules
      return audience === 'followers' || audience === 'friends';
    }
    return true;
  }

  async function searchDuniyaProvider(query, { limit = SEE_MORE_LIMIT } = {}) {
    const q = normalizeQuery(query);
    if (!q || q.length < 2) return [];
    if (!db) return [];
    try {
      // Recent public posts — client text filter + engagement rank (no full-text index yet)
      let snap;
      try {
        snap = await db
          .collection('duniya')
          .where('audience', '==', 'public')
          .orderBy('createdAt', 'desc')
          .limit(48)
          .get();
      } catch (e) {
        snap = await db.collection('duniya').orderBy('createdAt', 'desc').limit(48).get();
      }
      const rows = [];
      snap.docs.forEach((doc) => {
        const raw = { id: doc.id, ...doc.data() };
        if (!isPostVisibleClient(raw, 'duniya')) return;
        if (raw.audience && raw.audience !== 'public' && raw.uid !== currentUser?.uid) return;
        const hay = textHaystack(raw.caption, raw.text, ...(raw.tags || []));
        if (!hay.includes(q)) return;
        rows.push({
          type: 'duniya',
          category: 'duniya',
          id: doc.id,
          postId: doc.id,
          title: String(raw.caption || '').slice(0, 120) || 'Duniya post',
          subtitle: raw.user?.name || raw.authorName || '',
          photoURL: raw.media || raw.imageURL || raw.user?.photoURL || null,
          uid: raw.uid || raw.user?.uid || '',
          score: postEngagementScore(raw, q),
          raw,
        });
      });
      rows.sort((a, b) => b.score - a.score);
      return rows.slice(0, limit);
    } catch (e) {
      console.warn('[search] duniya', e?.message || e);
      return [];
    }
  }

  async function searchPeepalProvider(query, { limit = SEE_MORE_LIMIT } = {}) {
    const q = normalizeQuery(query);
    if (!q || q.length < 2) return [];
    if (!db) return [];
    try {
      let snap;
      try {
        snap = await db.collection('peepal').orderBy('createdAt', 'desc').limit(48).get();
      } catch (e) {
        snap = await db.collection('peepal').orderBy('ts', 'desc').limit(48).get();
      }
      const rows = [];
      const authorIds = [...new Set(snap.docs.map((d) => d.data()?.uid).filter(Boolean))];
      let hiddenAuthors = new Set();
      if (authorIds.length && typeof UsersPublic?.getPublicProfiles === 'function') {
        try {
          const pubs = await UsersPublic.getPublicProfiles(authorIds);
          Object.entries(pubs || {}).forEach(([id, u]) => {
            if (isHiddenFromDiscovery(u)) hiddenAuthors.add(id);
          });
        } catch (e) {}
      }
      snap.docs.forEach((doc) => {
        const raw = { id: doc.id, ...doc.data() };
        if (!isPostVisibleClient(raw, 'peepal')) return;
        if (raw.uid && hiddenAuthors.has(raw.uid)) return;
        const hay = textHaystack(raw.question, raw.text, raw.tag, raw.format);
        if (!hay.includes(q)) return;
        rows.push({
          type: 'peepal',
          category: 'peepal',
          id: doc.id,
          postId: doc.id,
          title: String(raw.question || '').slice(0, 120) || 'Peepal post',
          subtitle: raw.user?.name || raw.authorName || raw.format || '',
          photoURL: raw.user?.photoURL || null,
          uid: raw.uid || '',
          score: postEngagementScore(raw, q),
          raw,
        });
      });
      rows.sort((a, b) => b.score - a.score);
      return rows.slice(0, limit);
    } catch (e) {
      console.warn('[search] peepal', e?.message || e);
      return [];
    }
  }

  async function searchGroupsProvider(query, { limit = SEE_MORE_LIMIT } = {}) {
    const q = normalizeQuery(query);
    if (!q || q.length < 1) return [];
    const results = [];
    const seen = new Set();
    const myUid = currentUser?.uid;

    function pushGroup(g, scoreBoost) {
      const id = g.firestoreId || g.id;
      if (!id || seen.has(id)) return;
      const isMember = myUid && Array.isArray(g.participants) && g.participants.includes(myUid);
      const isPublic = typeof isGroupPublic === 'function' ? isGroupPublic(g) : g.isPublic !== false;
      // Private groups never appear for non-members
      if (!isPublic && !isMember) return;
      seen.add(id);
      const members = Number(g.memberCount != null ? g.memberCount : (g.participants || []).length);
      const name = String(g.name || '');
      const hay = textHaystack(name, g.description, g.nameLower);
      let score = scoreBoost || 0;
      score += Math.min(40, members);
      if (name.toLowerCase().startsWith(q)) score += 50;
      else if (hay.includes(q)) score += 25;
      results.push({
        type: 'group',
        category: 'groups',
        id,
        chatId: id,
        name,
        title: name || 'Group',
        subtitle: `${members} member${members === 1 ? '' : 's'}${isPublic ? ' · Public' : ' · Private'}`,
        photoURL: g.photoURL || (/^https:/.test(g.avatar || '') ? g.avatar : null),
        avatar: g.avatar || '👥',
        memberCount: members,
        isPublic,
        isMember: !!isMember,
        score,
        chat: g,
      });
    }

    // Own / cached inbox groups (includes private memberships)
    if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
      baithakChats
        .filter((c) => c.type === 'group')
        .forEach((c) => {
          const hay = textHaystack(c.name, c.description);
          if (hay.includes(q)) pushGroup(typeof normalizeGroupChat === 'function' ? normalizeGroupChat(c) : c, 10);
        });
    }

    if (db) {
      try {
        const snap = await db
          .collection('chats')
          .where('type', '==', 'group')
          .where('isPublic', '==', true)
          .orderBy('nameLower')
          .startAt(q)
          .endAt(endPrefix(q))
          .limit(limit)
          .get();
        snap.docs.forEach((doc) => {
          const raw = { id: doc.id, firestoreId: doc.id, ...doc.data() };
          pushGroup(typeof normalizeGroupChat === 'function' ? normalizeGroupChat(raw) : raw, 20);
        });
      } catch (e) {
        // Index may be building — fallback: recent public groups filtered client-side
        try {
          const snap = await db
            .collection('chats')
            .where('type', '==', 'group')
            .where('isPublic', '==', true)
            .limit(40)
            .get();
          snap.docs.forEach((doc) => {
            const raw = { id: doc.id, firestoreId: doc.id, ...doc.data() };
            const hay = textHaystack(raw.name, raw.description, raw.nameLower);
            if (hay.includes(q)) {
              pushGroup(typeof normalizeGroupChat === 'function' ? normalizeGroupChat(raw) : raw, 15);
            }
          });
        } catch (e2) {
          console.warn('[search] groups', e2?.message || e2);
        }
      }
    }

    results.sort((a, b) => b.score - a.score || b.memberCount - a.memberCount);
    return results.slice(0, limit);
  }

  registerSearchProvider('users', searchUsersProvider);
  registerSearchProvider('duniya', searchDuniyaProvider);
  registerSearchProvider('peepal', searchPeepalProvider);
  registerSearchProvider('groups', searchGroupsProvider);
  registerSearchProvider('games', async (query, { limit = SEE_MORE_LIMIT } = {}) => {
    const q = normalizeQuery(query);
    const catalog =
      typeof getGames === 'function'
        ? getGames({ dangal: true }).map((g) => ({
            type: 'game',
            category: 'games',
            id: g.id,
            title: g.name,
            subtitle: g.tagline || g.desc || 'Dangal',
            score: 70,
          }))
        : [
            { type: 'game', category: 'games', id: 'quiz', title: 'Muqabala', subtitle: 'Dangal quiz', score: 70 },
            { type: 'game', category: 'games', id: 'chess', title: 'Chess', subtitle: 'Board', score: 60 },
          ];
    return catalog
      .filter((g) => textHaystack(g.title, g.subtitle).includes(q))
      .slice(0, limit);
  });
  // Legacy stubs kept for callers
  registerSearchProvider('interests', async () => []);
  registerSearchProvider('companies', async () => []);
  registerSearchProvider('colleges', async () => []);
  registerSearchProvider('cities', async () => []);

  /**
   * @param {string} query
   * @param {{ types?: string[], limit?: number, limits?: Record<string, number> }} [opts]
   */
  async function universalSearch(query, { types = GLOBAL_TYPES, limit = SEE_MORE_LIMIT, limits } = {}) {
    const q = normalizeQuery(query);
    if (!q) return { query: q, byCategory: {}, results: [], errors: {} };

    // Server indexer first (extension point for crawl / Typesense later)
    if (typeof apiFetch === 'function') {
      try {
        const envelope = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'search_query', query: q, types, limit },
        });
        if (envelope?.ok && envelope.data?.categories && !envelope.data.degraded) {
          const byCategory = {};
          types.forEach((t) => {
            byCategory[t] = envelope.data.categories[t] || [];
          });
          const results = types.flatMap((t) => byCategory[t] || []);
          if (results.length) return { query: q, byCategory, results, errors: {}, source: 'api' };
        }
      } catch (e) {}
    }

    const byCategory = {};
    const errors = {};
    await Promise.all(
      types.map(async (type) => {
        const fn = providers[type];
        if (!fn) {
          byCategory[type] = [];
          return;
        }
        const per = (limits && limits[type]) || limit;
        try {
          byCategory[type] = await fn(q, { limit: per });
        } catch (e) {
          console.warn('[search]', type, e);
          byCategory[type] = [];
          errors[type] = e?.message || 'Search failed';
          if (typeof reportClientError === 'function') {
            reportClientError({
              feature: 'global_search',
              message: `${type}: ${e?.message || e}`,
              stack: e?.stack || '',
              screen: 'search',
            });
          }
        }
      })
    );
    const results = types.flatMap((t) => byCategory[t] || []);
    return { query: q, byCategory, results, errors, source: 'client' };
  }

  function openResult(r, closeSearch) {
    rememberSearch(document.getElementById('usInput')?.value || '');
    if (typeof closeSearch === 'function') closeSearch();
    else document.getElementById('universalSearchOverlay')?.remove();
    if (r.type === 'user' || r.category === 'users' || r.category === 'log' || r.category === 'personal' || r.category === 'professional') {
      const username = r.username;
      if (username && typeof navigateToDeepLink === 'function') navigateToDeepLink(`/profile/${username}`);
      else if (r.uid && typeof openPublicProfile === 'function') openPublicProfile({ uid: r.uid, name: r.name, username });
      else if (typeof showToast === 'function') showToast(`@${username || 'user'}`);
      return;
    }
    if (r.type === 'game' || r.category === 'games') {
      document.querySelector('.bottom-tabs .tab-btn[data-tab="dangal"]')?.click();
      if (r.id && typeof handleDangalGameTap === 'function') handleDangalGameTap(r.id);
      return;
    }
    if (r.type === 'duniya' || r.category === 'duniya') {
      if (typeof navigateToDeepLink === 'function') navigateToDeepLink(`/post/${r.postId || r.id}`);
      else if (typeof openDuniyaDetail === 'function') openDuniyaDetail(r.raw || r);
      return;
    }
    if (r.type === 'peepal' || r.category === 'peepal') {
      if (typeof navigateToDeepLink === 'function') navigateToDeepLink(`/post/${r.postId || r.id}`);
      else if (typeof openPeepalDetail === 'function') openPeepalDetail(r.raw || r);
      return;
    }
    if (r.type === 'group' || r.category === 'groups') {
      const chat = r.chat || { id: r.chatId, firestoreId: r.chatId, type: 'group', name: r.name, participants: r.chat?.participants };
      if (r.isMember && typeof openChatScreen === 'function') openChatScreen(chat);
      else if (typeof openGroupInfo === 'function') openGroupInfo(chat);
      else if (typeof showToast === 'function') showToast(r.name || 'Group');
    }
  }

  function renderResultRow(r) {
    if (r.category === 'users' || r.type === 'user' || r.category === 'log' || r.category === 'personal' || r.category === 'professional') {
      const cat = r.category === 'personal' || r.category === 'professional' ? r.category : 'log';
      return `
        <button type="button" class="us-result" data-cat="${cat}" data-uid="${escapeSearchHtml(r.uid || '')}" data-username="${escapeSearchHtml(r.username || '')}" data-name="${escapeSearchHtml(r.name || r.username || '')}">
          <div class="us-result-avatar">${r.photoURL ? `<img src="${escapeSearchHtml(r.photoURL)}" alt="">` : '👤'}</div>
          <div class="us-result-meta">
            <div class="us-result-title">${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(r.name || r.username, r) : escapeSearchHtml(r.name || r.username)}</div>
            <div class="us-result-sub">@${escapeSearchHtml(r.username || 'user')}${r.subtitle ? ' · ' + escapeSearchHtml(r.subtitle) : ''}${r.profileType === 'professional' ? ' · Pro' : ''}</div>
          </div>
        </button>`;
    }
    if (r.category === 'groups' || r.type === 'group') {
      const av = r.photoURL
        ? `<img src="${escapeSearchHtml(r.photoURL)}" alt="">`
        : escapeSearchHtml(r.avatar || '👥');
      return `
        <button type="button" class="us-result" data-cat="groups" data-id="${escapeSearchHtml(r.id)}">
          <div class="us-result-avatar">${av}</div>
          <div class="us-result-meta">
            <div class="us-result-title">${escapeSearchHtml(r.title || r.name)}</div>
            <div class="us-result-sub">${escapeSearchHtml(r.subtitle || '')}</div>
          </div>
        </button>`;
    }
    if (r.category === 'games' || r.type === 'game') {
      return `
        <button type="button" class="us-result" data-cat="games" data-id="${escapeSearchHtml(r.id)}">
          <div class="us-result-avatar">🎮</div>
          <div class="us-result-meta">
            <div class="us-result-title">${escapeSearchHtml(r.title || r.name || '')}</div>
            <div class="us-result-sub">${escapeSearchHtml(r.subtitle || 'Dangal')}</div>
          </div>
        </button>`;
    }
    // Duniya / Peepal posts — professional cards with like / comment / open
    const likes = Number(r.raw?.likes || r.raw?.likeCount || 0);
    const comments = Number(r.raw?.comments || r.raw?.commentCount || r.raw?.totalResponses || 0);
    const cat = r.category === 'peepal' ? 'peepal' : 'duniya';
    return `
      <article class="us-result us-result--post" data-cat="${cat}" data-id="${escapeSearchHtml(r.id)}">
        <button type="button" class="us-post-main" data-us-open>
          <div class="us-result-avatar">${r.photoURL ? `<img src="${escapeSearchHtml(r.photoURL)}" alt="">` : cat === 'peepal' ? '🌳' : '🌍'}</div>
          <div class="us-result-meta">
            <div class="us-result-title">${escapeSearchHtml(r.title || '')}</div>
            <div class="us-result-sub">${escapeSearchHtml(r.subtitle || '')}</div>
          </div>
        </button>
        <div class="us-post-engage" data-nav-ignore="1">
          <button type="button" class="us-engage-btn" data-us-like aria-label="Like">${typeof iconHtml === 'function' ? iconHtml('heart', { size: 16 }) : '♥'} <span data-like-count>${likes}</span></button>
          <button type="button" class="us-engage-btn" data-us-comment aria-label="Comment">${typeof iconHtml === 'function' ? iconHtml('message-circle', { size: 16 }) : '💬'} <span>${comments}</span></button>
          <button type="button" class="us-engage-btn" data-us-open aria-label="Open post">Open</button>
        </div>
      </article>`;
  }

  function splitUserVerticals(byCategory) {
    const users = byCategory.users || [];
    const personal = users.filter((u) => String(u.profileType || 'personal').toLowerCase() !== 'professional');
    const professional = users.filter((u) => String(u.profileType || '').toLowerCase() === 'professional');
    return {
      ...byCategory,
      log: users,
      personal,
      professional,
    };
  }

  function mixedAllResults(byCategory) {
    const buckets = ['log', 'duniya', 'peepal', 'groups', 'games'];
    const merged = [];
    buckets.forEach((k) => {
      (byCategory[k] || byCategory[k === 'log' ? 'users' : k] || []).forEach((r) => merged.push(r));
    });
    merged.sort((a, b) => (b.score || 0) - (a.score || 0));
    return merged;
  }

  function openUniversalSearch({ initialQuery = '', types = GLOBAL_TYPES } = {}) {
    const existing = document.getElementById('universalSearchOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'universalSearchOverlay';
    overlay.className = 'archive-overlay universal-search-overlay';
    overlay.dataset.navManaged = '1';
    const isGlobal = types.length > 1 || (types.length === 1 && types[0] !== 'users');
    const title = isGlobal
      ? (typeof t === 'function' ? t('search_chaupaal', 'Search Chaupaal') : 'Search Chaupaal')
      : (typeof t === 'function' ? t('search_people', 'Search people') : 'Search people');
    const placeholder = isGlobal
      ? (typeof t === 'function' ? t('search_ph_global', 'People, posts, groups…') : 'People, posts, groups…')
      : (typeof t === 'function' ? t('search_ph_people', 'Search @username or name…') : 'Search @username or name…');

    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" id="usBack" aria-label="Back" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">${escapeSearchHtml(title)}</div>
      </div>
      <div style="padding:12px 16px 0;">
        <input id="usInput" type="search" autocomplete="off" placeholder="${escapeSearchHtml(placeholder)}"
          data-living-ph="chaupaal_search"
          style="width:100%;padding:12px 14px;border:2px solid var(--line);border-radius:14px;font-size:15px;box-sizing:border-box;outline:none;"
          value="${String(initialQuery || '').replace(/"/g, '&quot;')}">
      </div>
      <div class="us-vertical-tabs" id="usTabs" role="tablist" hidden></div>
      <div id="usResults" style="flex:1;overflow:auto;padding:0 16px 24px;"></div>`;
    document.querySelector('.device')?.appendChild(overlay);

    const expanded = {};
    VERTICAL_ORDER.forEach((t) => {
      expanded[t] = false;
    });
    let lastByCategory = {};
    let lastErrors = {};
    let activeVertical = 'all';
    let runId = 0;

    const closeSearch = () => {
      clearTimeout(timer);
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      overlay.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('search_close');
      } catch (e) {}
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(overlay, closeSearch);
    overlay.querySelector('#usBack')?.addEventListener('click', closeSearch);
    overlay.addEventListener('chaupaal:dismiss', () => clearTimeout(timer));
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      }
    });

    const input = overlay.querySelector('#usInput');
    const resultsEl = overlay.querySelector('#usResults');
    const tabsEl = overlay.querySelector('#usTabs');
    let timer = null;
    if (typeof bindLivingPlaceholder === 'function') bindLivingPlaceholder(input, 'chaupaal_search');

    function renderSearchStart() {
      tabsEl.hidden = true;
      const history = loadSearchHistory();
      if (!history.length) {
        if (typeof renderEmptyState === 'function') {
          renderEmptyState(resultsEl, {
            icon: '🔍',
            title: title,
            message: typeof t === 'function' ? t('search_start_hint', 'Find Log, Personal & Professional profiles, Duniya, Peepal, Baithak & Dangal.') : 'Find Log, Personal & Professional profiles, Duniya, Peepal, Baithak & Dangal.',
          });
        } else resultsEl.innerHTML = '';
        return;
      }
      resultsEl.innerHTML = `
        <div class="search-history-head"><span>Recent searches</span><button type="button" data-clear-search-history>Clear</button></div>
        <div class="search-history-list">
          ${history.map((q) => `<button type="button" class="search-history-chip" data-history-query="${escapeSearchHtml(q)}">↗ ${escapeSearchHtml(q)}</button>`).join('')}
        </div>`;
      resultsEl.querySelector('[data-clear-search-history]')?.addEventListener('click', () => {
        clearSearchHistory();
        renderSearchStart();
      });
      resultsEl.querySelectorAll('[data-history-query]').forEach((btn) => {
        btn.addEventListener('click', () => {
          input.value = btn.dataset.historyQuery || '';
          run({ remember: true });
        });
      });
    }

    function countsForTabs(byCat) {
      return {
        all: mixedAllResults(byCat).length,
        log: (byCat.log || byCat.users || []).length,
        personal: (byCat.personal || []).length,
        professional: (byCat.professional || []).length,
        duniya: (byCat.duniya || []).length,
        peepal: (byCat.peepal || []).length,
        groups: (byCat.groups || []).length,
        games: (byCat.games || []).length,
      };
    }

    function paintTabs(byCat) {
      if (!isGlobal) {
        tabsEl.hidden = true;
        return;
      }
      const counts = countsForTabs(byCat);
      const visible = VERTICAL_ORDER.filter((id) => id === 'all' || counts[id] > 0);
      if (!visible.includes(activeVertical)) activeVertical = 'all';
      tabsEl.hidden = false;
      tabsEl.innerHTML = visible
        .map((id) => {
          const meta = CATEGORY_META[id] || { label: id };
          const n = counts[id] || 0;
          return `<button type="button" class="us-tab ${activeVertical === id ? 'is-active' : ''}" role="tab" data-us-tab="${id}" aria-selected="${activeVertical === id}">${escapeSearchHtml(meta.label)}${n ? ` · ${n}` : ''}</button>`;
        })
        .join('');
      tabsEl.querySelectorAll('[data-us-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeVertical = btn.dataset.usTab;
          paintCategories();
          paintTabs(lastByCategory);
        });
      });
    }

    function rowsForActive() {
      if (activeVertical === 'all') return mixedAllResults(lastByCategory);
      if (activeVertical === 'log') return lastByCategory.log || lastByCategory.users || [];
      return lastByCategory[activeVertical] || [];
    }

    function paintCategories() {
      const all = rowsForActive();
      const typeKey = activeVertical === 'log' ? 'users' : activeVertical === 'all' ? 'all' : activeVertical;
      const failed = !!(lastErrors && (lastErrors[typeKey] || lastErrors.users));
      if (!all.length) {
        const meta = CATEGORY_META[activeVertical] || { empty: 'No matches' };
        if (typeof renderEmptyState === 'function') {
          renderEmptyState(resultsEl, {
            icon: failed ? '⚠️' : '🌳',
            title: failed ? 'Search unavailable' : meta.empty || 'No matches',
            message: failed ? 'Try again in a moment.' : 'Try another spelling or a shorter prefix.',
          });
        } else {
          resultsEl.innerHTML = `<div style="padding:24px;color:var(--muted);text-align:center;">${meta.empty || 'No matches'}</div>`;
        }
        return;
      }
      const showAll = expanded[activeVertical];
      const slice = showAll ? all.slice(0, SEE_MORE_LIMIT) : all.slice(0, CATEGORY_PREVIEW);
      const moreLeft = all.length > CATEGORY_PREVIEW && !showAll;
      const meta = CATEGORY_META[activeVertical] || { label: activeVertical };
      resultsEl.innerHTML = `
        <section class="us-category" data-us-cat="${activeVertical}">
          <div class="us-category-head">${escapeSearchHtml(meta.label)}</div>
          ${slice.map(renderResultRow).join('')}
          ${moreLeft ? `<button type="button" class="us-see-more" data-see-more="${activeVertical}">Show all (${Math.min(all.length, SEE_MORE_LIMIT)})</button>` : ''}
        </section>`;

      resultsEl.querySelector('[data-see-more]')?.addEventListener('click', () => {
        expanded[activeVertical] = true;
        paintCategories();
      });

      resultsEl.querySelectorAll('.us-result, .us-result--post').forEach((el) => {
        const cat = el.dataset.cat;
        const list =
          cat === 'log' || cat === 'personal' || cat === 'professional'
            ? lastByCategory[cat] || lastByCategory.users || []
            : lastByCategory[cat] || [];
        let r = null;
        if (el.dataset.uid) r = list.find((x) => x.uid === el.dataset.uid) || (lastByCategory.users || []).find((x) => x.uid === el.dataset.uid);
        else r = list.find((x) => x.id === el.dataset.id);
        const open = () => {
          if (r) openResult(r, closeSearch);
        };
        el.querySelectorAll('[data-us-open]').forEach((btn) => btn.addEventListener('click', open));
        if (el.matches('button.us-result')) el.addEventListener('click', open);

        const avatar = el.querySelector('.us-result-avatar');
        if (avatar && r?.uid && typeof bindProfileLongPress === 'function' && (r.type === 'user' || r.category === 'users' || r.category === 'log')) {
          bindProfileLongPress(avatar, {
            uid: r.uid,
            name: r.name || r.username,
            username: r.username,
            photoURL: r.photoURL || '',
          });
        }

        el.querySelector('[data-us-like]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!r) return;
          const countEl = el.querySelector('[data-like-count]');
          const cur = Number(countEl?.textContent || 0);
          if (countEl) countEl.textContent = String(cur + 1);
          try {
            const collection = r.category === 'peepal' ? 'peepal' : 'duniya';
            const content = { ...(r.raw || r), firestoreId: r.postId || r.id, id: r.postId || r.id };
            if (typeof toggleContentLike === 'function') {
              const res = await toggleContentLike(collection, content);
              if (countEl && res && Number.isFinite(res.likes)) countEl.textContent = String(res.likes);
            }
            if (typeof SoundLib !== 'undefined' && SoundLib.like && !(typeof quietMode !== 'undefined' && quietMode)) {
              SoundLib.like();
            }
          } catch (err) {
            if (countEl) countEl.textContent = String(cur);
          }
        });
        el.querySelector('[data-us-comment]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          open();
        });
      });
    }

    async function run({ remember = false } = {}) {
      const q = input.value.trim();
      if (!q) {
        renderSearchStart();
        return;
      }
      if (remember) rememberSearch(q);
      VERTICAL_ORDER.forEach((t) => {
        expanded[t] = false;
      });
      const myRun = ++runId;
      if (typeof renderSkeleton === 'function') renderSkeleton(resultsEl, { variant: 'list', count: 4 });
      const limits = {};
      types.forEach((t) => {
        limits[t] = SEE_MORE_LIMIT;
      });
      const { byCategory, errors } = await universalSearch(q, { types, limits });
      if (myRun !== runId) return;
      let enriched = byCategory;
      if (typeof enrichUsersWithProfileType === 'function' && byCategory.users?.length) {
        await enrichUsersWithProfileType(byCategory.users);
      }
      if (myRun !== runId) return;
      lastByCategory = splitUserVerticals(enriched);
      lastErrors = errors || {};
      activeVertical = 'all';
      paintTabs(lastByCategory);
      paintCategories();
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 280);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        run({ remember: true });
      }
    });
    setTimeout(() => {
      input.focus();
      if (initialQuery) run({ remember: true });
      else renderSearchStart();
    }, 50);
  }

  function wireGlobalSearchEntry() {
    document.getElementById('globalSearchBtn')?.addEventListener('click', () => openUniversalSearch());
    document.getElementById('globalSearchBtnDesktop')?.addEventListener('click', () => openUniversalSearch());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireGlobalSearchEntry);
  } else {
    wireGlobalSearchEntry();
  }

  window.registerSearchProvider = registerSearchProvider;
  window.universalSearch = universalSearch;
  window.searchUsersProvider = searchUsersProvider;
  // Dynamic-list boundary (CONVENTIONS 4c): search UI renders provider results
  window.openUniversalSearch = typeof safeFeature === 'function'
    ? safeFeature('search_open', openUniversalSearch)
    : openUniversalSearch;
  window.normalizeSearchQuery = normalizeQuery;
  window.SEARCH_CATEGORY_PREVIEW = CATEGORY_PREVIEW;
  window.SEARCH_SEE_MORE_LIMIT = SEE_MORE_LIMIT;
})();
