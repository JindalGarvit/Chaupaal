/**
 * Universal search (Phase 4) — Firestore-native first.
 *
 * Architecture: register providers on a shared interface. Today only `users`
 * (username + display name) is active. Later providers (interests, companies,
 * colleges, cities) plug in via registerSearchProvider() without rewriting callers.
 *
 * Query strategy now:
 * - Exact username via `usernames/{username}` doc
 * - Prefix match via ordered document IDs on `usernames` (startAt/endAt)
 * - Optional nameLower prefix on `users` when the field exists
 *
 * SCALE NOTE: If search quality/speed becomes a real problem (large corpus,
 * typo tolerance, ranking), the next step is a dedicated search service such as
 * Algolia (has a free tier) or Typesense — plug it in as another provider
 * behind the same interface. Do NOT rewrite UI call sites.
 */
(function () {
  /** @type {Record<string, (query: string, opts: object) => Promise<object[]>>} */
  const providers = {};
  const SEARCH_HISTORY_KEY = 'chaupaal_search_history';
  const SEARCH_HISTORY_LIMIT = 8;

  function loadSearchHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter((q) => typeof q === 'string' && q.trim()).slice(0, SEARCH_HISTORY_LIMIT) : [];
    } catch (e) {
      return [];
    }
  }

  function rememberSearch(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const next = [q, ...loadSearchHistory().filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, SEARCH_HISTORY_LIMIT);
    try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch (e) {}
  }

  function clearSearchHistory() {
    try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch (e) {}
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

  async function searchUsersProvider(query, { limit = 20 } = {}) {
    const q = normalizeQuery(query);
    if (!q || q.length < 1) return [];
    const results = [];
    const seen = new Set();

    if (!db) {
      // Offline / demo fallback — sample discovery pool
      const pool = typeof SAMPLE_DISCOVERY_POOL !== 'undefined' ? SAMPLE_DISCOVERY_POOL : [];
      return pool
        .filter((u) => {
          const un = String(u.username || u.name || '')
            .toLowerCase()
            .replace(/\s+/g, '_');
          return un.includes(q) || String(u.name || '').toLowerCase().includes(q);
        })
        .slice(0, limit)
        .map((u) => ({
          type: 'user',
          id: u.uid,
          uid: u.uid,
          username: (u.username || String(u.name || '').toLowerCase().replace(/\s+/g, '_')),
          name: u.name,
          photoURL: u.photoURL || null,
          city: u.city || '',
          subtitle: [u.city, (u.interests || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
        }));
    }

    // 1) Exact username hit
    try {
      const exact = await db.collection('usernames').doc(q).get();
      if (exact.exists) {
        const uid = exact.data()?.uid;
        if (uid && !seen.has(uid)) {
          seen.add(uid);
          const userSnap = await db.collection('users').doc(uid).get();
          const u = userSnap.data() || {};
          results.push({
            type: 'user',
            id: uid,
            uid,
            username: q,
            name: u.name || q,
            photoURL: u.photoURL || u.photoThumb || null,
            city: u.city || u.profile?.currentCity || '',
            subtitle: u.city || '',
          });
        }
      }
    } catch (e) {}

    // 2) Prefix on usernames collection (doc IDs = usernames)
    try {
      const snap = await db
        .collection('usernames')
        .orderBy(firebase.firestore.FieldPath.documentId())
        .startAt(q)
        .endAt(endPrefix(q))
        .limit(limit)
        .get();
      for (const doc of snap.docs) {
        const uid = doc.data()?.uid;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        const userSnap = await db.collection('users').doc(uid).get();
        const u = userSnap.data() || {};
        results.push({
          type: 'user',
          id: uid,
          uid,
          username: doc.id,
          name: u.name || doc.id,
          photoURL: u.photoURL || u.photoThumb || null,
          city: u.city || u.profile?.currentCity || '',
          subtitle: u.city || '',
        });
        if (results.length >= limit) break;
      }
    } catch (e) {
      console.warn('[search] username prefix failed', e?.message || e);
    }

    // 3) Optional nameLower prefix (users who have the denormalized field)
    if (results.length < limit) {
      try {
        const snap = await db
          .collection('users')
          .orderBy('nameLower')
          .startAt(q)
          .endAt(endPrefix(q))
          .limit(limit)
          .get();
        snap.docs.forEach((doc) => {
          if (results.length >= limit) return;
          const u = doc.data() || {};
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          results.push({
            type: 'user',
            id: doc.id,
            uid: doc.id,
            username: u.username || '',
            name: u.name || '',
            photoURL: u.photoURL || u.photoThumb || null,
            city: u.city || '',
            subtitle: u.city || '',
          });
        });
      } catch (e) {
        // Index / missing field — skip silently (prefix username still works)
      }
    }

    return results.slice(0, limit);
  }

  // Placeholders for future providers — register stubs so types are discoverable
  async function stubProvider() {
    return [];
  }

  registerSearchProvider('users', searchUsersProvider);
  registerSearchProvider('interests', stubProvider); // future
  registerSearchProvider('companies', stubProvider); // future
  registerSearchProvider('colleges', stubProvider); // future
  registerSearchProvider('cities', stubProvider); // future

  /**
   * @param {string} query
   * @param {{ types?: string[], limit?: number }} [opts]
   */
  async function universalSearch(query, { types = ['users'], limit = 20 } = {}) {
    const q = normalizeQuery(query);
    if (!q) return { query: q, results: [] };
    const perType = Math.max(5, Math.ceil(limit / Math.max(1, types.length)));
    const batches = await Promise.all(
      types.map(async (type) => {
        const fn = providers[type];
        if (!fn) return [];
        try {
          return await fn(q, { limit: perType });
        } catch (e) {
          console.warn('[search]', type, e);
          return [];
        }
      })
    );
    const results = batches.flat().slice(0, limit);
    return { query: q, results };
  }

  function openUniversalSearch({ initialQuery = '', types = ['users'] } = {}) {
    const existing = document.getElementById('universalSearchOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'universalSearchOverlay';
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button id="usBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Search</div>
      </div>
      <div style="padding:12px 16px;">
        <input id="usInput" type="search" autocomplete="off" placeholder="Search @username or name…"
          style="width:100%;padding:12px 14px;border:2px solid var(--line);border-radius:14px;font-size:15px;box-sizing:border-box;outline:none;"
          value="${String(initialQuery || '').replace(/"/g, '&quot;')}">
        <div style="font-size:11px;color:var(--muted);margin-top:8px;">Users now · interests & cities coming later</div>
      </div>
      <div id="usResults" style="flex:1;overflow:auto;padding:0 16px 24px;"></div>`;
    document.querySelector('.device')?.appendChild(overlay);
    const closeSearch = () => {
      clearTimeout(timer);
      overlay.remove();
    };
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
            title: 'Find people',
            message: 'Try a username or display name.',
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

    async function run({ remember = false } = {}) {
      const q = input.value.trim();
      if (!q) {
        renderSearchStart();
        return;
      }
      if (remember) rememberSearch(q);
      if (typeof renderSkeleton === 'function') renderSkeleton(resultsEl, { variant: 'list', count: 3 });
      const { results } = await universalSearch(q, { types, limit: 20 });
      if (!results.length) {
        if (typeof renderEmptyState === 'function') {
          renderEmptyState(resultsEl, {
            icon: '🌳',
            title: 'No matches',
            message: 'Try another spelling or a shorter prefix.',
          });
        } else resultsEl.innerHTML = '<div style="padding:24px;color:var(--muted);text-align:center;">No matches</div>';
        return;
      }
      resultsEl.innerHTML = results
        .map(
          (r) => `
        <button type="button" class="us-result" data-type="${r.type}" data-uid="${r.uid || ''}" data-username="${r.username || ''}"
          style="display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--white);margin-bottom:8px;cursor:pointer;text-align:left;">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--line);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">
            ${r.photoURL ? `<img src="${r.photoURL}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
          </div>
          <div style="min-width:0;flex:1;">
            <div style="font-weight:700;font-size:14px;">${r.name || r.username}</div>
            <div style="font-size:12px;color:var(--muted);">@${r.username || 'user'}${r.subtitle ? ' · ' + r.subtitle : ''}</div>
          </div>
        </button>`
        )
        .join('');

      resultsEl.querySelectorAll('.us-result').forEach((btn) => {
        btn.addEventListener('click', () => {
          rememberSearch(input.value);
          overlay.remove();
          const username = btn.dataset.username;
          if (username && typeof navigateToDeepLink === 'function') {
            navigateToDeepLink(`/profile/${username}`);
          } else if (typeof showToast === 'function') {
            showToast(`@${username}`);
          }
        });
      });
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

  window.registerSearchProvider = registerSearchProvider;
  window.universalSearch = universalSearch;
  window.openUniversalSearch = openUniversalSearch;
  window.normalizeSearchQuery = normalizeQuery;
})();
