/**
 * Cursor-based Firestore pagination (Phase 2).
 *
 * Why startAfter (not offset): Firestore has no efficient OFFSET. Skipping N docs
 * still bills/reads those docs. Cursor pagination resumes after the last snapshot
 * and scales with page size only.
 *
 * Soft-delete tradeoff: we prefer `.where('deleted','==',false).orderBy(createdAt)`
 * when an index exists. If the composite index is missing, we fall back to
 * orderBy-only and filter deleted client-side (slightly more reads, no hard fail).
 *
 * Migration: old docs without `createdAt` / `deleted` won't appear in ordered
 * queries until backfilled (see soft-delete helper header).
 */
(function () {
  const DEFAULT_PAGE = 10;
  const infiniteCallbacks = new WeakMap();
  let infiniteObserver = null;

  /**
   * @param {object} opts
   * @param {FirebaseFirestore.CollectionReference|FirebaseFirestore.Query} opts.queryBase
   *   Base query BEFORE orderBy/limit (filters only).
   * @param {string} [opts.orderField='createdAt']
   * @param {'asc'|'desc'} [opts.direction='desc']
   * @param {number} [opts.pageSize=10]
   * @param {FirebaseFirestore.DocumentSnapshot|null} [opts.cursor]
   * @param {boolean} [opts.excludeDeleted=true] Try server-side deleted==false
   * @returns {Promise<{items:object[], docs:FirebaseFirestore.QueryDocumentSnapshot[], lastDoc:FirebaseFirestore.QueryDocumentSnapshot|null, hasMore:boolean}>}
   */
  async function fetchFirestorePage({
    queryBase,
    orderField = 'createdAt',
    direction = 'desc',
    pageSize = DEFAULT_PAGE,
    cursor = null,
    excludeDeleted = true,
  } = {}) {
    if (!queryBase) {
      return { items: [], docs: [], lastDoc: null, hasMore: false };
    }

    async function run(q) {
      let query = q.orderBy(orderField, direction);
      if (cursor) query = query.startAfter(cursor);
      query = query.limit(pageSize);
      const snap = await query.get();
      const docs = snap.docs;
      const items = docs.map((d) => {
        const data = d.data() || {};
        return { id: d.id, ...data, __doc: d };
      });
      return {
        items,
        docs,
        lastDoc: docs.length ? docs[docs.length - 1] : null,
        hasMore: docs.length >= pageSize,
      };
    }

    if (excludeDeleted) {
      try {
        return await run(queryBase.where('deleted', '==', false));
      } catch (err) {
        // Missing composite index or legacy docs without `deleted` — degrade gracefully.
        console.warn('[firestore-page] deleted filter unavailable, filtering client-side', err?.message || err);
      }
    }

    const page = await run(queryBase);
    const kept = page.items.filter((it) => !isSoftDeleted(it));
    return {
      items: kept,
      docs: page.docs.filter((d) => !isSoftDeleted(d.data())),
      lastDoc: page.lastDoc,
      hasMore: page.hasMore,
    };
  }

  function isSoftDeleted(data) {
    if (!data) return false;
    if (data.deleted === true) return true;
    if (data.deletedAt != null) return true;
    return false;
  }

  function getInfiniteObserver() {
    if (infiniteObserver || typeof IntersectionObserver === 'undefined') return infiniteObserver;
    infiniteObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const trigger = infiniteCallbacks.get(entry.target);
          if (typeof trigger === 'function') trigger();
        });
      },
      { root: null, rootMargin: '320px 0px', threshold: 0.01 }
    );
    return infiniteObserver;
  }

  /**
   * Attach an automatic infinite-scroll sentinel. The button remains visible only
   * when IntersectionObserver is unavailable, preserving a no-JS/legacy fallback.
   * Existing callers may keep using ensureLoadMoreButton; it aliases this helper.
   */
  function ensureInfiniteScroll(container, { label = 'Load more', onLoadMore, busyLabel = 'Loading…' } = {}) {
    if (!container) return null;
    let sentinel = container.querySelector('[data-ui="infinite-scroll"]');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.dataset.ui = 'infinite-scroll';
      sentinel.className = 'ui-infinite-sentinel';
      sentinel.innerHTML = `
        <span class="ui-infinite-status" role="status" aria-live="polite">Scroll for more</span>
        <button type="button" class="ui-load-more-btn" data-ui="load-more"></button>`;
      container.appendChild(sentinel);
    }
    const btn = sentinel.querySelector('[data-ui="load-more"]');
    const status = sentinel.querySelector('.ui-infinite-status');
    const observer = getInfiniteObserver();
    btn.textContent = label;
    btn.hidden = !!observer;
    btn.disabled = false;

    const trigger = async () => {
      if (sentinel.dataset.busy === '1' || typeof onLoadMore !== 'function') return;
      sentinel.dataset.busy = '1';
      btn.disabled = true;
      btn.textContent = busyLabel;
      if (status) status.textContent = busyLabel;
      observer?.unobserve(sentinel);
      try {
        await onLoadMore();
      } finally {
        sentinel.dataset.busy = '0';
        btn.disabled = false;
        btn.textContent = label;
        if (status) status.textContent = 'Scroll for more';
        if (sentinel.isConnected) observer?.observe(sentinel);
      }
    };

    btn.onclick = trigger;
    infiniteCallbacks.set(sentinel, trigger);
    observer?.observe(sentinel);
    return sentinel;
  }

  /**
   * Backwards-compatible name used throughout the app.
   */
  function ensureLoadMoreButton(container, opts = {}) {
    return ensureInfiniteScroll(container, opts);
  }

  function setLoadMoreVisible(container, visible) {
    const sentinel = container?.querySelector?.('[data-ui="infinite-scroll"]');
    if (sentinel) {
      sentinel.style.display = visible ? '' : 'none';
      if (!visible) infiniteObserver?.unobserve(sentinel);
      else infiniteObserver?.observe(sentinel);
      return;
    }
    const btn = container?.querySelector?.('[data-ui="load-more"]');
    if (btn) btn.style.display = visible ? '' : 'none';
  }

  /**
   * Load older chat messages (cursor moves backward in time).
   * Newest window uses limitToLast; older pages use endBefore(oldest) + limit + reverse.
   */
  async function fetchOlderMessages(chatId, { beforeDoc, pageSize = 30 } = {}) {
    if (!db || !chatId) return { items: [], firstDoc: null, hasMore: false };
    let q = db.collection('chats').doc(chatId).collection('messages').orderBy('ts', 'desc');
    if (beforeDoc) q = q.startAfter(beforeDoc);
    q = q.limit(pageSize);
    const snap = await q.get();
    const docsAsc = snap.docs.slice().reverse();
    return {
      items: docsAsc.map((d) => ({ id: d.id, ...d.data(), __doc: d })),
      firstDoc: docsAsc.length ? docsAsc[0] : null, // oldest in this page (use as next beforeDoc)
      hasMore: snap.docs.length >= pageSize,
      docs: docsAsc,
    };
  }

  window.fetchFirestorePage = fetchFirestorePage;
  window.isSoftDeleted = isSoftDeleted;
  window.ensureInfiniteScroll = ensureInfiniteScroll;
  window.ensureLoadMoreButton = ensureLoadMoreButton;
  window.setLoadMoreVisible = setLoadMoreVisible;
  window.fetchOlderMessages = fetchOlderMessages;
  window.FIRESTORE_PAGE_SIZE = DEFAULT_PAGE;
})();
