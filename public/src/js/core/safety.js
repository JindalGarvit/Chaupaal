/**
 * Safety: block / unblock + report (Phase 3).
 *
 * Block list: blocks/{uid}.blocked[] + local dismissedUids for instant UI.
 * Reports: user_flags with stable reasonCode + optional customText.
 * Reasons match product brief; "Other" opens a free-text box.
 */
(function () {
  const REPORT_REASONS = [
    { code: 'spam', label: 'Spam' },
    { code: 'harassment', label: 'Harassment' },
    { code: 'fake_profile', label: 'Fake profile' },
    { code: 'inappropriate', label: 'Inappropriate content' },
    { code: 'impersonation', label: 'Impersonation' },
    { code: 'custom', label: 'Other (type your reason)' },
  ];

  // Back-compat alias used by older call sites
  const FLAG_REASONS = REPORT_REASONS.map((r) => r.label);

  function getBlockedSet() {
    if (typeof dismissedUids !== 'undefined' && dismissedUids instanceof Set) return dismissedUids;
    try {
      return new Set(JSON.parse(localStorage.getItem('chaupaal_dismissed_uids') || '[]'));
    } catch (e) {
      return new Set();
    }
  }

  async function loadBlockedFromFirestore() {
    if (!db || !currentUser) return;
    try {
      const snap = await db.collection('blocks').doc(currentUser.uid).get();
      const list = snap.data()?.blocked || [];
      list.forEach((uid) => {
        if (typeof dismissedUids !== 'undefined') dismissedUids.add(uid);
      });
      try {
        localStorage.setItem('chaupaal_dismissed_uids', JSON.stringify([...getBlockedSet()]));
      } catch (e) {}
    } catch (e) {}
  }

  async function blockUser(uid, name) {
    if (!uid) return;
    if (typeof dismissedUids !== 'undefined') dismissedUids.add(uid);
    try {
      localStorage.setItem('chaupaal_dismissed_uids', JSON.stringify([...getBlockedSet()]));
    } catch (e) {}
    if (typeof duniyaPosts !== 'undefined') {
      duniyaPosts = duniyaPosts.filter((p) => p.user?.uid !== uid);
      if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
    }
    if (typeof peepalQuestions !== 'undefined') {
      peepalQuestions = peepalQuestions.filter((q) => q.user?.uid !== uid);
      if (typeof renderPeepalFeed === 'function') renderPeepalFeed();
    }
    if (typeof showToast === 'function') showToast(`${name || 'User'} blocked. You won't see their content.`);
    if (db && currentUser) {
      await db
        .collection('blocks')
        .doc(currentUser.uid)
        .set({ blocked: firebase.firestore.FieldValue.arrayUnion(uid) }, { merge: true })
        .catch(() => {});
    }
  }

  async function unblockUser(uid, name) {
    if (!uid) return;
    if (typeof dismissedUids !== 'undefined') dismissedUids.delete(uid);
    try {
      localStorage.setItem('chaupaal_dismissed_uids', JSON.stringify([...getBlockedSet()]));
    } catch (e) {}
    if (db && currentUser) {
      await db
        .collection('blocks')
        .doc(currentUser.uid)
        .set({ blocked: firebase.firestore.FieldValue.arrayRemove(uid) }, { merge: true })
        .catch(() => {});
    }
    if (typeof showToast === 'function') showToast(`${name || 'User'} unblocked`);
  }

  async function listBlockedUsers() {
    const ids = [...getBlockedSet()];
    if (!ids.length) return [];
    if (!db) return ids.map((uid) => ({ uid, name: uid }));
    const out = [];
    for (const uid of ids.slice(0, 40)) {
      try {
        const snap = await db.collection('users').doc(uid).get();
        const d = snap.data();
        out.push({ uid, name: d?.name || 'User', username: d?.username || '' });
      } catch (e) {
        out.push({ uid, name: 'User' });
      }
    }
    return out;
  }

  async function flagUser(uid, reasonOrCode, opts = {}) {
    if (!uid) return;
    let reasonCode = 'custom';
    let reasonLabel = String(reasonOrCode || 'Other');
    let customText = opts.customText || '';

    const match = REPORT_REASONS.find((r) => r.code === reasonOrCode || r.label === reasonOrCode);
    if (match) {
      reasonCode = match.code;
      reasonLabel = match.label;
    }

    if (reasonCode === 'custom' && !customText) customText = reasonLabel;

    if (db && currentUser) {
      await db
        .collection('user_flags')
        .add({
          reportedUid: uid,
          reporterUid: currentUser.uid,
          reason: reasonLabel,
          reasonCode,
          customText: customText || null,
          targetType: opts.targetType || 'user',
          postId: opts.postId || null,
          ts: Date.now(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch(() => {});
    }
    if (typeof addNotification === 'function') addNotification('system', '⚑', 'Report submitted for review.');
  }

  /**
   * @param {object} target - { uid, name }
   * @param {object} [opts] - { postId, targetType }
   */
  function openFlagSheet(target, opts = {}) {
    const user = target || {};
    const sheet = document.createElement('div');
    sheet.className = 'flag-sheet';
    sheet.innerHTML = `
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;">Report or Block</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">${user.name || 'User'}</div>
      ${REPORT_REASONS.map(
        (r) => `<div class="flag-option" data-code="${r.code}">⚑ ${r.label}</div>`
      ).join('')}
      <div id="flagCustomWrap" class="hidden" style="margin:8px 0 12px;">
        <textarea id="flagCustomText" placeholder="Tell us what happened…" style="width:100%;min-height:72px;border:2px solid var(--line);border-radius:12px;padding:10px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
        <button type="button" class="ui-state-btn ui-state-btn-primary" id="flagCustomSubmit" style="width:100%;margin-top:8px;">Submit report</button>
      </div>
      <div class="flag-option" data-block="1" style="color:var(--red);">🚫 Block ${user.name || 'user'}</div>
      <button id="closeFlagSheet" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:8px;">Cancel</button>
    `;
    document.querySelector('.device')?.appendChild(sheet);

    sheet.querySelectorAll('[data-code]').forEach((el) => {
      el.addEventListener('click', async () => {
        const code = el.dataset.code;
        if (code === 'custom') {
          sheet.querySelector('#flagCustomWrap')?.classList.remove('hidden');
          sheet.querySelector('#flagCustomText')?.focus();
          return;
        }
        await flagUser(user.uid, code, opts);
        sheet.remove();
        if (typeof showToast === 'function') showToast("Report submitted. We'll review it. 🙏");
      });
    });

    sheet.querySelector('#flagCustomSubmit')?.addEventListener('click', async () => {
      const text = sheet.querySelector('#flagCustomText')?.value?.trim();
      if (!text) {
        if (typeof showToast === 'function') showToast('Please enter a reason');
        return;
      }
      await flagUser(user.uid, 'custom', { ...opts, customText: text });
      sheet.remove();
      if (typeof showToast === 'function') showToast("Report submitted. We'll review it. 🙏");
    });

    sheet.querySelector('[data-block]')?.addEventListener('click', async () => {
      await blockUser(user.uid, user.name);
      sheet.remove();
    });
    sheet.querySelector('#closeFlagSheet')?.addEventListener('click', () => sheet.remove());
  }

  async function openBlockedUsersSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button id="blockedBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Blocked users</div>
      </div>
      <div id="blockedList" style="flex:1;overflow:auto;padding:12px 16px 24px;"></div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('#blockedBack')?.addEventListener('click', () => overlay.remove());

    const list = overlay.querySelector('#blockedList');
    if (typeof renderSkeleton === 'function') renderSkeleton(list, { variant: 'list', count: 2 });
    const rows = await listBlockedUsers();
    if (!rows.length) {
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(list, {
          icon: '🚫',
          title: 'No blocked users',
          message: 'People you block won’t show up in your feeds.',
        });
      }
      return;
    }
    list.innerHTML = rows
      .map(
        (u) => `<div class="recovery-row">
        <div class="recovery-preview">${u.name}${u.username ? ` · @${u.username}` : ''}</div>
        <button type="button" class="ui-state-btn" data-unblock="${u.uid}" data-name="${u.name}">Unblock</button>
      </div>`
      )
      .join('');
    list.querySelectorAll('[data-unblock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await unblockUser(btn.dataset.unblock, btn.dataset.name);
        overlay.remove();
        openBlockedUsersSheet();
      });
    });
  }

  window.REPORT_REASONS = REPORT_REASONS;
  window.FLAG_REASONS = FLAG_REASONS;
  window.blockUser = blockUser;
  window.unblockUser = unblockUser;
  window.flagUser = flagUser;
  window.openFlagSheet = openFlagSheet;
  window.openBlockedUsersSheet = openBlockedUsersSheet;
  window.loadBlockedFromFirestore = loadBlockedFromFirestore;
  window.listBlockedUsers = listBlockedUsers;
})();
