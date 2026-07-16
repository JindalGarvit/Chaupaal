/**
 * Soft delete + Undo + recovery bin (Phase 2).
 *
 * Architecture: never call Firestore .delete() for user content. Mark
 * `deleted:true` + `deletedAt` so we can Undo (short window) and recover
 * (up to RECOVERY_DAYS). Permanent purge can be a scheduled cleanup later.
 *
 * Firestore rules: owners already `allow update` on peepal/duniya — soft
 * delete is an update. Prefer tightening later so non-owners cannot flip `deleted`.
 *
 * Migration / backfill (no formal SQL migrations):
 * 1. Existing `duniya` / `peepal` docs without `deleted` are treated as active
 *    (`isSoftDeleted` only true when deleted===true or deletedAt set).
 * 2. Optional one-time Admin script: set `deleted:false` on all docs missing it
 *    so the indexed query `where('deleted','==',false).orderBy('createdAt')` works.
 * 3. Docs missing `createdAt` won't paginate — backfill from `ts` or write-time.
 * 4. Ensure new creates always write: audience (duniya), createdAt, deleted:false.
 */
(function () {
  const UNDO_MS = 8000;
  const RECOVERY_DAYS = 30;
  const RECOVERY_MS = RECOVERY_DAYS * 24 * 60 * 60 * 1000;

  function contentRef(collection, id) {
    if (!db || !collection || !id) return null;
    return db.collection(collection).doc(id);
  }

  async function softDeleteDoc(collection, id) {
    const ref = contentRef(collection, id);
    if (!ref) return false;
    await ref.update({
      deleted: true,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  async function restoreDoc(collection, id) {
    const ref = contentRef(collection, id);
    if (!ref) return false;
    await ref.update({
      deleted: false,
      deletedAt: firebase.firestore.FieldValue.delete(),
    });
    return true;
  }

  function showUndoToast({ message = 'Deleted', onUndo }) {
    // Prefer a sticky undo bar over a fleeting toast — users need time to tap Undo.
    let bar = document.getElementById('softDeleteUndoBar');
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.id = 'softDeleteUndoBar';
    bar.className = 'soft-delete-undo-bar';
    bar.innerHTML = `
      <span>${message}</span>
      <button type="button" class="soft-delete-undo-btn" data-ui="undo">Undo</button>`;
    const root = document.querySelector('.device') || document.body;
    root.appendChild(bar);

    let undone = false;
    const cleanup = () => {
      bar?.remove();
      bar = null;
    };
    const timer = setTimeout(cleanup, UNDO_MS);

    bar.querySelector('[data-ui="undo"]')?.addEventListener('click', async () => {
      if (undone) return;
      undone = true;
      clearTimeout(timer);
      cleanup();
      if (typeof onUndo === 'function') await onUndo();
    });
  }

  /**
   * Soft-delete from feeds: mutate local array, re-render, persist, offer Undo.
   * @param {object} opts
   * @param {'duniya'|'peepal'} opts.kind
   * @param {string} opts.id — local id (may equal Firestore doc id)
   * @param {string} [opts.firestoreId] — Firestore id if different from local id
   * @param {string} opts.collection
   * @param {Array} opts.list — in-memory array to splice
   * @param {Function} opts.render — re-render after change
   * @param {string} [opts.label]
   */
  function softDeleteContent({
    kind,
    id,
    firestoreId,
    collection,
    list,
    render,
    label = 'Post deleted',
  }) {
    if (!Array.isArray(list)) return;
    const idx = list.findIndex((x) => x.id === id || x.firestoreId === id);
    if (idx < 0) return;
    const item = list[idx];
    const fsId = firestoreId || item.firestoreId || (String(id).startsWith('d_') || String(id).startsWith('q_') ? null : id);

    list.splice(idx, 1);
    if (typeof render === 'function') render();

    // Remember for recovery bin (local cache + optional Firestore)
    rememberDeleted({ kind, item, collection, firestoreId: fsId });

    let remoteDone = Promise.resolve(false);
    if (db && currentUser && fsId && collection) {
      remoteDone = softDeleteDoc(collection, fsId).catch((e) => {
        console.warn('[soft-delete] remote failed', e);
        return false;
      });
    }

    showUndoToast({
      message: label,
      onUndo: async () => {
        list.splice(idx, 0, item);
        forgetDeleted(kind, item.id);
        if (typeof render === 'function') render();
        await remoteDone;
        if (db && currentUser && fsId && collection) {
          try {
            await restoreDoc(collection, fsId);
          } catch (e) {}
        }
        if (typeof showToast === 'function') showToast('Restored ✓');
      },
    });
  }

  function recoveryKey() {
    return 'chaupaal_recovery_bin';
  }

  function readRecoveryBin() {
    try {
      const all = JSON.parse(localStorage.getItem(recoveryKey()) || '[]');
      const cutoff = Date.now() - RECOVERY_MS;
      return all.filter((x) => (x.deletedAtMs || 0) >= cutoff);
    } catch (e) {
      return [];
    }
  }

  function writeRecoveryBin(items) {
    try {
      localStorage.setItem(recoveryKey(), JSON.stringify(items.slice(0, 50)));
    } catch (e) {}
  }

  function rememberDeleted({ kind, item, collection, firestoreId }) {
    const items = readRecoveryBin();
    items.unshift({
      kind,
      collection,
      firestoreId: firestoreId || null,
      id: item.id,
      preview: item.caption || item.question || item.text || 'Deleted item',
      deletedAtMs: Date.now(),
      snapshot: {
        id: item.id,
        caption: item.caption,
        question: item.question,
        user: item.user,
        format: item.format,
        options: item.options,
        media: null, // don't keep large base64 in recovery bin
        type: item.type,
        ts: item.ts,
      },
    });
    writeRecoveryBin(items);
  }

  function forgetDeleted(kind, id) {
    writeRecoveryBin(readRecoveryBin().filter((x) => !(x.kind === kind && x.id === id)));
  }

  async function recoverFromBin(entry) {
    if (!entry) return;
    forgetDeleted(entry.kind, entry.id);
    if (entry.firestoreId && entry.collection && db && currentUser) {
      try {
        await restoreDoc(entry.collection, entry.firestoreId);
      } catch (e) {
        if (typeof showToast === 'function') showToast(typeof friendlyError === 'function' ? friendlyError(e) : 'Could not restore');
        return;
      }
    }
    // Re-inject snapshot into local feed
    const snap = { ...(entry.snapshot || {}), id: entry.id, deleted: false };
    if (entry.kind === 'duniya' && typeof duniyaPosts !== 'undefined') {
      duniyaPosts.unshift(snap);
      if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
    } else if (entry.kind === 'peepal' && typeof peepalQuestions !== 'undefined') {
      peepalQuestions.unshift(snap);
      if (typeof renderPeepalFeed === 'function') renderPeepalFeed();
    }
    if (typeof showToast === 'function') showToast('Restored from recovery bin ✓');
  }

  function openRecoveryBin() {
    const items = readRecoveryBin();
    const overlay = document.createElement('div');
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button id="recoveryBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">🗑️ Recently deleted</div>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:var(--muted);">Items stay here for ${RECOVERY_DAYS} days, then they’re gone for good.</div>
      <div style="flex:1;overflow-y:auto;padding:0 16px 24px;">
        ${
          !items.length
            ? `<div class="ui-state ui-state-empty"><div class="ui-state-icon">🗑️</div><div class="ui-state-title">Nothing here</div><div class="ui-state-msg">Deleted posts will appear here for a limited time.</div></div>`
            : items
                .map(
                  (it, i) => `
            <div class="recovery-row" data-i="${i}">
              <div class="recovery-preview">${(it.preview || '').slice(0, 120)}</div>
              <div class="recovery-meta">${it.kind} · ${
                    typeof formatRelativeTime === 'function'
                      ? formatRelativeTime(it.deletedAtMs)
                      : 'recently'
                  }</div>
              <button type="button" class="ui-state-btn ui-state-btn-primary recovery-restore" data-i="${i}">Restore</button>
            </div>`
                )
                .join('')
        }
      </div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('#recoveryBack')?.addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('.recovery-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const entry = items[parseInt(btn.dataset.i, 10)];
        await recoverFromBin(entry);
        overlay.remove();
        openRecoveryBin();
      });
    });
  }

  window.softDeleteDoc = softDeleteDoc;
  window.restoreDoc = restoreDoc;
  window.softDeleteContent = softDeleteContent;
  window.showUndoToast = showUndoToast;
  window.openRecoveryBin = openRecoveryBin;
  window.readRecoveryBin = readRecoveryBin;
  window.RECOVERY_BIN_DAYS = RECOVERY_DAYS;
})();
