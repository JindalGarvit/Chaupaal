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

  /**
   * Attach a "Load more" control under a feed. Reuses one button; caller owns fetch.
   */
  function ensureLoadMoreButton(container, { label = 'Load more', onLoadMore, busyLabel = 'Loading…' } = {}) {
    if (!container) return null;
    let btn = container.querySelector('[data-ui="load-more"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.ui = 'load-more';
      btn.className = 'ui-load-more-btn';
      container.appendChild(btn);
    }
    btn.textContent = label;
    btn.disabled = false;
    btn.onclick = async () => {
      if (typeof onLoadMore !== 'function') return;
      btn.disabled = true;
      btn.textContent = busyLabel;
      try {
        await onLoadMore();
      } finally {
        // Caller should call setLoadMoreVisible / ensure again after render.
        btn.disabled = false;
        btn.textContent = label;
      }
    };
    return btn;
  }

  function setLoadMoreVisible(container, visible) {
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
  window.ensureLoadMoreButton = ensureLoadMoreButton;
  window.setLoadMoreVisible = setLoadMoreVisible;
  window.fetchOlderMessages = fetchOlderMessages;
  window.FIRESTORE_PAGE_SIZE = DEFAULT_PAGE;
})();
