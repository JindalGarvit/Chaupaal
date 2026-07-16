/**
 * Draft autosave for compose sheets (Phase 2).
 *
 * Primary store: localStorage (instant, offline-safe, no read cost).
 * Secondary store: Firestore users/{uid}/drafts/{name} when signed in —
 * restores across devices; still debounced; never blocks the UI on network.
 *
 * clearDraft on successful publish (both stores).
 */
(function () {
  const DEBOUNCE_MS = 400;

  function draftKey(name) {
    return `chaupaal_draft_${name}`;
  }

  function loadDraft(name) {
    try {
      const raw = localStorage.getItem(draftKey(name));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveDraftLocal(name, data) {
    try {
      localStorage.setItem(
        draftKey(name),
        JSON.stringify({ ...data, savedAt: Date.now() })
      );
    } catch (e) {
      // Quota exceeded — drafts are best-effort.
    }
  }

  function saveDraftRemote(name, data) {
    if (!db || !currentUser) return;
    db.collection('users')
      .doc(currentUser.uid)
      .collection('drafts')
      .doc(name)
      .set(
        {
          ...data,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          savedAt: Date.now(),
        },
        { merge: true }
      )
      .catch(() => {});
  }

  function saveDraft(name, data) {
    saveDraftLocal(name, data);
    saveDraftRemote(name, data);
  }

  function clearDraft(name) {
    try {
      localStorage.removeItem(draftKey(name));
    } catch (e) {}
    if (db && currentUser) {
      db.collection('users')
        .doc(currentUser.uid)
        .collection('drafts')
        .doc(name)
        .delete()
        .catch(() => {});
    }
  }

  async function loadDraftPreferRemote(name) {
    const local = loadDraft(name);
    if (!db || !currentUser) return local;
    try {
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('drafts')
        .doc(name)
        .get();
      if (!snap.exists) return local;
      const remote = snap.data() || {};
      const remoteTs = remote.savedAt || remote.updatedAt?.toMillis?.() || 0;
      const localTs = local?.savedAt || 0;
      // Prefer whichever was typed more recently
      if (remoteTs >= localTs && (remote.caption || remote.question || remote.text)) {
        saveDraftLocal(name, remote);
        return remote;
      }
    } catch (e) {}
    return local;
  }

  /**
   * Wire inputs to autosave. Returns { restore, clear, flush }.
   * getState() must return a plain JSON-serializable object.
   */
  function bindDraftAutosave({ name, getState, applyState, fields = [] }) {
    let timer = null;
    const flush = () => {
      timer = null;
      if (typeof getState === 'function') saveDraft(name, getState());
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };

    fields.forEach((el) => {
      if (!el) return;
      el.addEventListener('input', schedule);
      el.addEventListener('change', schedule);
    });

    // Restore: sync optionally from Firestore then apply
    (async () => {
      const existing = await loadDraftPreferRemote(name);
      if (existing && typeof applyState === 'function') {
        applyState(existing);
        if (
          typeof showToast === 'function' &&
          (existing.caption || existing.question || existing.text)
        ) {
          showToast('Draft restored ✎');
        }
      }
    })();

    return {
      restore: () => loadDraftPreferRemote(name),
      clear: () => {
        if (timer) clearTimeout(timer);
        clearDraft(name);
      },
      flush,
    };
  }

  window.loadDraft = loadDraft;
  window.saveDraft = saveDraft;
  window.clearDraft = clearDraft;
  window.bindDraftAutosave = bindDraftAutosave;
  window.loadDraftPreferRemote = loadDraftPreferRemote;
})();
