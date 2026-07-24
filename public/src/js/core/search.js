/**
 * Unified global search (Phase 3.1) — LinkedIn-style category sections.
 *
 * Categories: Profiles · Duniya · Peepal · Baithak groups (public / own).
 * Per-tab search bars stay unchanged; this is additive via the top-bar icon.
 *
 * Visibility: reuse existing checks (hiddenFromDiscovery, duniya audience,
 * soft-delete, peepal read rules, private groups excluded for non-members).
 */
(function () {
  /** @type {Record<string, (query: string, opts: object) => Promise<object[]>>} */
  const providers = {};
  const SEARCH_HISTORY_KEY = 'chaupaal_search_history';
  const SEARCH_HISTORY_LIMIT = 8;

  /** Initial rows per category; “See more” expands to SEE_MORE_LIMIT. */
  const CATEGORY_PREVIEW = 5;
  const SEE_MORE_LIMIT = 20;

  const GLOBAL_TYPES = ['users', 'duniya', 'peepal', 'groups'];

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
      if (row.username === q) score += 100;
      else if (row.username.startsWith(q)) score += 60;
      if (String(row.name || '').toLowerCase().startsWith(q)) score += 40;
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
          return un.includes(q) || String(u.name || '').toLowerCase().includes(q);
        })
        .slice(0, limit)
        .map((u) => mapUserResult(u.uid, u));
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
    return { query: q, byCategory, results, errors };
  }

  const CATEGORY_META = {
    users: { label: 'Profiles', empty: 'No people matched' },
    duniya: { label: 'Duniya', empty: 'No Duniya posts matched' },
    peepal: { label: 'Peepal', empty: 'No Peepal posts matched' },
    groups: { label: 'Baithak groups', empty: 'No public groups matched' },
  };

  function openResult(r, closeSearch) {
    rememberSearch(document.getElementById('usInput')?.value || '');
    if (typeof closeSearch === 'function') closeSearch();
    else document.getElementById('universalSearchOverlay')?.remove();
    if (r.type === 'user' || r.category === 'users') {
      const username = r.username;
      if (username && typeof navigateToDeepLink === 'function') navigateToDeepLink(`/profile/${username}`);
      else if (r.uid && typeof openPublicProfile === 'function') openPublicProfile({ uid: r.uid, name: r.name, username });
      else if (typeof showToast === 'function') showToast(`@${username || 'user'}`);
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
    if (r.category === 'users' || r.type === 'user') {
      return `
        <button type="button" class="us-result" data-cat="users" data-uid="${escapeSearchHtml(r.uid || '')}" data-username="${escapeSearchHtml(r.username || '')}" data-name="${escapeSearchHtml(r.name || r.username || '')}">
          <div class="us-result-avatar">${r.photoURL ? `<img src="${escapeSearchHtml(r.photoURL)}" alt="">` : '👤'}</div>
          <div class="us-result-meta">
            <div class="us-result-title">${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(r.name || r.username, r) : escapeSearchHtml(r.name || r.username)}</div>
            <div class="us-result-sub">@${escapeSearchHtml(r.username || 'user')}${r.subtitle ? ' · ' + escapeSearchHtml(r.subtitle) : ''}</div>
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
    return `
      <button type="button" class="us-result" data-cat="${escapeSearchHtml(r.category || r.type)}" data-id="${escapeSearchHtml(r.id)}">
        <div class="us-result-avatar">${r.photoURL ? `<img src="${escapeSearchHtml(r.photoURL)}" alt="">` : r.category === 'peepal' ? '🌳' : '🌍'}</div>
        <div class="us-result-meta">
          <div class="us-result-title">${escapeSearchHtml(r.title || '')}</div>
          <div class="us-result-sub">${escapeSearchHtml(r.subtitle || '')}</div>
        </div>
      </button>`;
  }

  function openUniversalSearch({ initialQuery = '', types = GLOBAL_TYPES } = {}) {
    const existing = document.getElementById('universalSearchOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'universalSearchOverlay';
    overlay.className = 'archive-overlay universal-search-overlay';
    overlay.dataset.navManaged = '1';
    const isGlobal = types.length > 1 || (types.length === 1 && types[0] !== 'users');
    const title = isGlobal || types.includes('duniya') || types.includes('groups') ? 'Search Chaupaal' : 'Search people';
    const placeholder = isGlobal ? 'People, posts, groups…' : 'Search @username or name…';
    const hint = isGlobal
      ? 'Profiles · Duniya · Peepal · Public groups'
      : 'People by username or display name';

    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" id="usBack" aria-label="Back" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">${title}</div>
      </div>
      <div style="padding:12px 16px;">
        <input id="usInput" type="search" autocomplete="off" placeholder="${placeholder}"
          style="width:100%;padding:12px 14px;border:2px solid var(--line);border-radius:14px;font-size:15px;box-sizing:border-box;outline:none;"
          value="${String(initialQuery || '').replace(/"/g, '&quot;')}">
        <div style="font-size:11px;color:var(--muted);margin-top:8px;">${hint}</div>
      </div>
      <div id="usResults" style="flex:1;overflow:auto;padding:0 16px 24px;"></div>`;
    document.querySelector('.device')?.appendChild(overlay);

    const expanded = {};
    GLOBAL_TYPES.forEach((t) => {
      expanded[t] = false;
    });
    let lastByCategory = {};
    let lastErrors = {};
    let runId = 0;

    const closeSearch = () => {
      clearTimeout(timer);
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      overlay.remove();
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
    let timer = null;

    function renderSearchStart() {
      const history = loadSearchHistory();
      if (!history.length) {
        if (typeof renderEmptyState === 'function') {
          renderEmptyState(resultsEl, {
            icon: '🔍',
            title: 'Search Chaupaal',
            message: 'Find people, Duniya & Peepal posts, and public groups.',
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

    function paintCategories() {
      const sections = [];
      let any = false;
      const errTypes = Object.keys(lastErrors || {});
      types.forEach((type) => {
        const all = lastByCategory[type] || [];
        const failed = !!(lastErrors && lastErrors[type]);
        if (!all.length && !failed) return;
        any = true;
        const meta = CATEGORY_META[type] || { label: type };
        if (failed && !all.length) {
          sections.push(`
            <section class="us-category" data-us-cat="${type}">
              <div class="us-category-head">${escapeSearchHtml(meta.label)}</div>
              <div class="cp-feature-error" role="status">Couldn't search ${escapeSearchHtml(meta.label)} — try again.</div>
            </section>`);
          return;
        }
        const showAll = expanded[type];
        const slice = showAll ? all.slice(0, SEE_MORE_LIMIT) : all.slice(0, CATEGORY_PREVIEW);
        const moreLeft = all.length > CATEGORY_PREVIEW && !showAll;
        sections.push(`
          <section class="us-category" data-us-cat="${type}">
            <div class="us-category-head">${escapeSearchHtml(meta.label)}</div>
            ${slice.map(renderResultRow).join('')}
            ${moreLeft ? `<button type="button" class="us-see-more" data-see-more="${type}">Show all (${Math.min(all.length, SEE_MORE_LIMIT)})</button>` : ''}
          </section>`);
      });
      if (!any) {
        const allFailed = errTypes.length > 0 && errTypes.length >= types.length;
        if (typeof renderEmptyState === 'function') {
          renderEmptyState(resultsEl, {
            icon: allFailed ? '⚠️' : '🌳',
            title: allFailed ? 'Search unavailable' : 'No matches',
            message: allFailed
              ? 'Something went wrong loading results. Try again in a moment.'
              : 'Try another spelling or a shorter prefix.',
          });
        } else {
          resultsEl.innerHTML = `<div style="padding:24px;color:var(--muted);text-align:center;">${
            allFailed ? 'Search unavailable — try again' : 'No matches'
          }</div>`;
        }
        return;
      }
      resultsEl.innerHTML = sections.join('');

      resultsEl.querySelectorAll('[data-see-more]').forEach((btn) => {
        btn.addEventListener('click', () => {
          expanded[btn.dataset.seeMore] = true;
          paintCategories();
        });
      });

      const flat = types.flatMap((t) => lastByCategory[t] || []);
      resultsEl.querySelectorAll('.us-result').forEach((btn, idx) => {
        // Map button back to result via order within painted slices — re-find by data attrs
        const cat = btn.dataset.cat;
        const list = lastByCategory[cat] || [];
        let r = null;
        if (cat === 'users') r = list.find((x) => x.uid === btn.dataset.uid);
        else r = list.find((x) => x.id === btn.dataset.id);
        if (!r) r = flat[idx];
        const avatar = btn.querySelector('.us-result-avatar');
        if (avatar && r?.uid && typeof bindProfileLongPress === 'function' && (r.type === 'user' || r.category === 'users')) {
          bindProfileLongPress(avatar, {
            uid: r.uid,
            name: r.name || r.username,
            username: r.username,
            photoURL: r.photoURL || '',
          });
        }
        btn.addEventListener('click', () => {
          if (r) openResult(r, closeSearch);
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
      GLOBAL_TYPES.forEach((t) => {
        expanded[t] = false;
      });
      const myRun = ++runId;
      if (typeof renderSkeleton === 'function') renderSkeleton(resultsEl, { variant: 'list', count: 4 });
      const limits = {};
      types.forEach((t) => {
        limits[t] = SEE_MORE_LIMIT;
      });
      const { byCategory, errors } = await universalSearch(q, { types, limits });
      if (myRun !== runId) return; // stale response
      lastByCategory = byCategory;
      lastErrors = errors || {};
      if (typeof enrichUsersWithProfileType === 'function' && byCategory.users?.length) {
        await enrichUsersWithProfileType(byCategory.users);
      }
      if (myRun !== runId) return;
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
  // Dynamic-list boundary (CONVENTIONS 4c): search UI renders provider results
  window.openUniversalSearch = typeof safeFeature === 'function'
    ? safeFeature('search_open', openUniversalSearch)
    : openUniversalSearch;
  window.normalizeSearchQuery = normalizeQuery;
  window.SEARCH_CATEGORY_PREVIEW = CATEGORY_PREVIEW;
  window.SEARCH_SEE_MORE_LIMIT = SEE_MORE_LIMIT;
})();
