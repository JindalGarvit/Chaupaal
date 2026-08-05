/**
 * Safety: block / unblock + report (Phase 3).
 *
 * Block list: blocks/{uid}.blocked[] + local dismissedUids for instant UI.
 * Reports: user_flags (admin) + users/{uid}/reported/{targetUid} (private mirror).
 * Reasons match product brief; "Other" opens a free-text box.
 * After block/report: ~5s Undo chip. Settings hosts Blocked & Reported lists.
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

  const SAFETY_UNDO_REASONS = [
    { code: 'mistake', label: 'Blocked/reported by mistake' },
    { code: 'resolved', label: 'Issue resolved' },
    { code: 'changed_mind', label: 'Changed my mind' },
    { code: 'other', label: 'Other' },
  ];

  // Back-compat alias used by older call sites
  const FLAG_REASONS = REPORT_REASONS.map((r) => r.label);

  const UNDO_MS = 5000;

  function getBlockedSet() {
    if (typeof dismissedUids !== 'undefined' && dismissedUids instanceof Set) return dismissedUids;
    try {
      return new Set(JSON.parse(localStorage.getItem('chaupaal_dismissed_uids') || '[]'));
    } catch (e) {
      return new Set();
    }
  }

  function showSafetyUndo(message, onUndo) {
    if (typeof showUndoToast === 'function') {
      try {
        // micro.js: (msg, { onUndo, duration })
        showUndoToast(message, { onUndo, duration: UNDO_MS });
        return;
      } catch (e) {}
      try {
        // soft-delete.js: ({ message, onUndo })
        showUndoToast({ message, onUndo });
        return;
      } catch (e) {}
    }
    if (typeof showToast === 'function') showToast(message);
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

  async function blockUser(uid, name, opts = {}) {
    if (!uid) return;
    if (typeof currentUser !== 'undefined' && currentUser && uid === currentUser.uid) {
      if (typeof showToast === 'function') showToast("You can't block yourself");
      return;
    }
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
    if (db && currentUser) {
      await db
        .collection('blocks')
        .doc(currentUser.uid)
        .set({ blocked: firebase.firestore.FieldValue.arrayUnion(uid) }, { merge: true })
        .catch(() => {});
      // Blocking immediately breaks mutual friendship and removes both Close
      // Friends memberships through the canonical unfollow path.
      if (typeof setFollowing === 'function') await setFollowing(uid, false, 'block').catch(() => {});
      if (typeof apiFetch === 'function') {
        apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: { action: 'block_signal', targetUid: uid },
        }).catch(() => {});
      }
    }
    if (!opts.silent) {
      showSafetyUndo(`${name || 'User'} blocked`, async () => {
        await unblockUser(uid, name, { silent: true, skipReason: true });
        if (typeof showToast === 'function') showToast('Block undone');
        if (typeof refreshSettingsSafetyLists === 'function') refreshSettingsSafetyLists();
      });
    } else if (typeof showToast === 'function') {
      showToast(`${name || 'User'} blocked. You won't see their content.`);
    }
  }

  async function unblockUser(uid, name, opts = {}) {
    if (!uid) return;
    const reason = opts.reason || null;
    if (!opts.skipReason && !reason && opts.requireReason !== false && opts.fromSettings) {
      const picked = await pickSafetyReasonSheet('Why unblock?');
      if (!picked) return;
      opts.reason = picked;
    }
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
    if (!opts.silent && typeof showToast === 'function') {
      showToast(`${name || 'User'} unblocked`);
    }
  }

  async function listBlockedUsers() {
    const ids = [...getBlockedSet()];
    if (!ids.length) return [];
    if (!db) return ids.map((uid) => ({ uid, name: uid }));
    const out = [];
    for (const uid of ids.slice(0, 40)) {
      try {
        const p =
          typeof UsersPublic?.getPublicProfile === 'function'
            ? await UsersPublic.getPublicProfile(uid)
            : null;
        out.push({
          uid,
          name: p?.name || 'User',
          username: p?.username || '',
          profileType: p?.profileType || p?.profile?.profileType || 'personal',
        });
      } catch (e) {
        out.push({ uid, name: 'User' });
      }
    }
    return out;
  }

  async function rememberReportLocal(uid, payload) {
    if (!db || !currentUser || !uid) return;
    try {
      await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('reported')
        .doc(uid)
        .set(
          {
            targetUid: uid,
            name: payload.name || null,
            username: payload.username || null,
            reasonCode: payload.reasonCode || null,
            reason: payload.reasonLabel || null,
            customText: payload.customText || null,
            flagId: payload.flagId || null,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (e) {}
  }

  async function flagUser(uid, reasonOrCode, opts = {}) {
    if (!uid) return null;
    let reasonCode = 'custom';
    let reasonLabel = String(reasonOrCode || 'Other');
    let customText = opts.customText || '';

    const match = REPORT_REASONS.find((r) => r.code === reasonOrCode || r.label === reasonOrCode);
    if (match) {
      reasonCode = match.code;
      reasonLabel = match.label;
    }

    if (reasonCode === 'custom' && !customText) customText = reasonLabel;

    let flagId = null;
    if (db && currentUser && typeof apiFetch === 'function') {
      try {
        const envelope = await apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: {
            action: 'flag_user',
            targetUid: uid,
            targetName: opts.name || null,
            targetUsername: opts.username || null,
            reasonCode,
            reason: reasonLabel,
            customText: customText || null,
            targetType: opts.targetType || 'user',
            postId: opts.postId || null,
            chatId: opts.chatId || null,
          },
        });
        flagId = envelope?.data?.flagId || null;
      } catch (e) {
        // Fallback local flag if API down
        try {
          const ref = await db.collection('user_flags').add({
            reportedUid: uid,
            reporterUid: currentUser.uid,
            reason: reasonLabel,
            reasonCode,
            customText: customText || null,
            targetType: opts.targetType || 'user',
            postId: opts.postId || null,
            commentId: opts.commentId || null,
            icebreakerQuestion: opts.icebreakerQuestion || null,
            chatId: opts.chatId || null,
            status: 'active',
            ts: Date.now(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          flagId = ref.id;
        } catch (e2) {}
        await rememberReportLocal(uid, {
          name: opts.name,
          username: opts.username,
          reasonCode,
          reasonLabel,
          customText,
          flagId,
        });
      }
    } else if (db && currentUser) {
      try {
        const ref = await db.collection('user_flags').add({
          reportedUid: uid,
          reporterUid: currentUser.uid,
          reason: reasonLabel,
          reasonCode,
          customText: customText || null,
          targetType: opts.targetType || 'user',
          postId: opts.postId || null,
          commentId: opts.commentId || null,
          icebreakerQuestion: opts.icebreakerQuestion || null,
          chatId: opts.chatId || null,
          status: 'active',
          ts: Date.now(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        flagId = ref.id;
      } catch (e) {}
      await rememberReportLocal(uid, {
        name: opts.name,
        username: opts.username,
        reasonCode,
        reasonLabel,
        customText,
        flagId,
      });
    }
    if (typeof addNotification === 'function') addNotification('system', '⚑', 'Report submitted for review.');

    if (!opts.silent) {
      showSafetyUndo('Report submitted', async () => {
        await withdrawReport(uid, {
          flagId,
          name: opts.name,
          reason: 'mistake',
          silent: true,
          skipReason: true,
        });
        if (typeof showToast === 'function') showToast('Report withdrawn');
        if (typeof refreshSettingsSafetyLists === 'function') refreshSettingsSafetyLists();
      });
    }
    return { flagId };
  }

  async function withdrawReport(uid, opts = {}) {
    if (!uid) return;
    let reason = opts.reason || null;
    if (!opts.skipReason && opts.requireReason !== false && opts.fromSettings) {
      const picked = await pickSafetyReasonSheet('Why remove this report?');
      if (!picked) return;
      reason = picked;
    }
    reason = reason || 'changed_mind';

    if (typeof apiFetch === 'function' && currentUser) {
      try {
        await apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: {
            action: 'withdraw_flag',
            targetUid: uid,
            flagId: opts.flagId || null,
            withdrawReason: reason,
          },
        });
      } catch (e) {
        if (db && currentUser) {
          await db
            .collection('users')
            .doc(currentUser.uid)
            .collection('reported')
            .doc(uid)
            .set(
              {
                status: 'withdrawn',
                withdrawReason: reason,
                withdrawnAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
            .catch(() => {});
        }
      }
    } else if (db && currentUser) {
      await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('reported')
        .doc(uid)
        .set(
          {
            status: 'withdrawn',
            withdrawReason: reason,
            withdrawnAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => {});
    }
    if (!opts.silent && typeof showToast === 'function') {
      showToast(`Report on ${opts.name || 'user'} removed`);
    }
  }

  async function listReportedUsers() {
    if (!currentUser) return [];
    if (typeof apiFetch === 'function') {
      try {
        const envelope = await apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: { action: 'list_my_reports' },
        });
        if (envelope?.ok && Array.isArray(envelope.data?.items)) {
          return envelope.data.items.map((r) => ({
            uid: r.targetUid || r.id,
            name: r.name || 'User',
            username: r.username || '',
            reason: r.reason || '',
            flagId: r.flagId || null,
          }));
        }
      } catch (e) {}
    }
    if (!db) return [];
    try {
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('reported')
        .limit(60)
        .get();
      return snap.docs
        .map((d) => {
          const data = d.data() || {};
          return {
            uid: data.targetUid || d.id,
            name: data.name || 'User',
            username: data.username || '',
            reason: data.reason || data.reasonCode || '',
            flagId: data.flagId || null,
            status: data.status || 'active',
          };
        })
        .filter((r) => r.status !== 'withdrawn');
    } catch (e) {
      return [];
    }
  }

  function pickSafetyReasonSheet(title) {
    return new Promise((resolve) => {
      if (typeof openHalfSheet !== 'function') {
        resolve('changed_mind');
        return;
      }
      const bodyHtml = `<div class="safety-reason-list" role="list">
        ${SAFETY_UNDO_REASONS.map(
          (r) =>
            `<button type="button" class="cp-menu-item safety-reason-item" data-reason="${r.code}" role="listitem">${r.label}</button>`
        ).join('')}
        <button type="button" class="btn btn--block" data-reason-cancel style="margin-top:8px;">Cancel</button>
      </div>`;
      openHalfSheet({
        id: 'safetyReasonSheet',
        title: title || 'Reason',
        snap: 'compact',
        accent: 'baithak',
        bodyHtml,
        onMount(sheet, close) {
          sheet.querySelectorAll('[data-reason]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const code = btn.dataset.reason;
              close();
              resolve(code);
            });
          });
          sheet.querySelector('[data-reason-cancel]')?.addEventListener('click', () => {
            close();
            resolve(null);
          });
        },
      });
    });
  }

  /**
   * @param {object} target - { uid, name }
   * @param {object} [opts] - { postId, targetType }
   */
  function openFlagSheet(target, opts = {}) {
    // Tear down any prior flag sheet via nav-stack so history depth stays honest
    const prevSheet = document.querySelector('.flag-sheet');
    if (prevSheet) {
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(prevSheet);
      } catch (e) {}
      try {
        prevSheet.remove();
      } catch (e) {}
    }
    try {
      document.querySelector('.flag-sheet-scrim')?.remove();
    } catch (e) {}

    const user = target || {};
    const scrim = document.createElement('div');
    scrim.className = 'flag-sheet-scrim';
    scrim.dataset.navIgnore = '1';
    scrim.setAttribute('aria-hidden', 'true');

    const sheet = document.createElement('div');
    sheet.className = 'flag-sheet';
    sheet.dataset.navManaged = '1';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Report or block');
    sheet.innerHTML = `
      <div class="flag-sheet-handle" aria-hidden="true"></div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;">Something off?</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">Help keep Chaupaal kind — report ${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(user.name||'this person',user):(user.name||'this person')} or take a break from them.</div>
      ${REPORT_REASONS.map(
        (r) => `<div class="flag-option" data-code="${r.code}">${r.label}</div>`
      ).join('')}
      <div id="flagCustomWrap" class="hidden" style="margin:8px 0 12px;">
        <textarea id="flagCustomText" placeholder="Tell us what happened…" style="width:100%;min-height:72px;border:2px solid var(--line);border-radius:12px;padding:10px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
        <button type="button" class="btn btn--primary btn--block ui-state-btn ui-state-btn-primary" id="flagCustomSubmit" style="width:100%;margin-top:8px;">Submit report</button>
      </div>
      <div class="flag-option" data-block="1" style="color:var(--red);">Block ${user.name || 'user'}</div>
      <button type="button" id="closeFlagSheet" data-overlay-dismiss style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:8px;">Not now</button>
    `;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(scrim);
    device.appendChild(sheet);
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      sheet.classList.add('is-open');
    });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      } catch (e) {}
      sheet.classList.remove('is-open');
      scrim.classList.remove('is-open');
      setTimeout(() => {
        try {
          sheet.remove();
        } catch (e) {}
        try {
          scrim.remove();
        } catch (e) {}
      }, 200);
    };

    if (typeof pushNavLayer === 'function') {
      pushNavLayer(sheet, close);
    }
    if (typeof enableSwipeDismiss === 'function') {
      enableSwipeDismiss(sheet, close);
    }
    scrim.addEventListener('click', close);
    sheet.querySelector('#closeFlagSheet')?.addEventListener('click', close);

    sheet.querySelectorAll('[data-code]').forEach((el) => {
      el.addEventListener('click', async () => {
        const code = el.dataset.code;
        if (code === 'custom') {
          sheet.querySelector('#flagCustomWrap')?.classList.remove('hidden');
          sheet.querySelector('#flagCustomText')?.focus();
          return;
        }
        try {
          await flagUser(user.uid, code, {
            ...opts,
            name: user.name,
            username: user.username,
          });
          close();
        } catch (e) {
          if (typeof showToast === 'function') showToast('Couldn’t submit report — try again');
        }
      });
    });

    sheet.querySelector('#flagCustomSubmit')?.addEventListener('click', async () => {
      const text = sheet.querySelector('#flagCustomText')?.value?.trim();
      if (!text) {
        if (typeof showToast === 'function') showToast('Please enter a reason');
        return;
      }
      try {
        await flagUser(user.uid, 'custom', {
          ...opts,
          customText: text,
          name: user.name,
          username: user.username,
        });
        close();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Couldn’t submit report — try again');
      }
    });

    sheet.querySelector('[data-block]')?.addEventListener('click', async () => {
      try {
        await blockUser(user.uid, user.name);
        close();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Couldn’t block — try again');
      }
    });
  }

  async function openBlockedUsersSheet() {
    // Prefer Settings Safety section when available
    if (typeof openSettingsModal === 'function' && document.getElementById('settingsSafetySection')) {
      openSettingsModal();
      setTimeout(() => {
        const sec = document.getElementById('settingsSafetySection');
        if (sec) {
          sec.open = true;
          sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        document.getElementById('settingsBlockedDetails')?.setAttribute('open', '');
        if (typeof refreshSettingsSafetyLists === 'function') refreshSettingsSafetyLists();
      }, 80);
      return;
    }

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
        <div class="recovery-preview">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(u.name,u):u.name}${u.username ? ` · @${u.username}` : ''}</div>
        <button type="button" class="btn btn--secondary ui-state-btn" data-unblock="${u.uid}" data-name="${u.name}">Unblock</button>
      </div>`
      )
      .join('');
    list.querySelectorAll('[data-unblock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await unblockUser(btn.dataset.unblock, btn.dataset.name, { fromSettings: true });
        overlay.remove();
        openBlockedUsersSheet();
      });
    });
  }

  async function renderSettingsSafetyLists() {
    const blockedHost = document.getElementById('settingsBlockedList');
    const reportedHost = document.getElementById('settingsReportedList');
    const blockedCount = document.getElementById('settingsBlockedCount');
    const reportedCount = document.getElementById('settingsReportedCount');
    if (!blockedHost && !reportedHost) return;

    if (blockedHost) {
      blockedHost.innerHTML = '<div class="toggle-desc">Loading…</div>';
      const rows = await listBlockedUsers();
      if (blockedCount) blockedCount.textContent = String(rows.length);
      if (!rows.length) {
        blockedHost.innerHTML = '<div class="toggle-desc">No blocked people.</div>';
      } else {
        blockedHost.innerHTML = rows
          .map(
            (u) => `<div class="settings-safety-row">
            <div class="settings-safety-meta">
              <strong>${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(u.name, u) : u.name}</strong>
              ${u.username ? `<span class="toggle-desc">@${u.username}</span>` : ''}
            </div>
            <button type="button" class="btn btn--secondary" data-settings-unblock="${u.uid}" data-name="${(u.name || '').replace(/"/g, '&quot;')}">Unblock</button>
          </div>`
          )
          .join('');
        blockedHost.querySelectorAll('[data-settings-unblock]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            await unblockUser(btn.dataset.settingsUnblock, btn.dataset.name, {
              fromSettings: true,
              requireReason: true,
            });
            renderSettingsSafetyLists();
          });
        });
      }
    }

    if (reportedHost) {
      reportedHost.innerHTML = '<div class="toggle-desc">Loading…</div>';
      const rows = await listReportedUsers();
      if (reportedCount) reportedCount.textContent = String(rows.length);
      if (!rows.length) {
        reportedHost.innerHTML = '<div class="toggle-desc">No active reports.</div>';
      } else {
        reportedHost.innerHTML = rows
          .map(
            (u) => `<div class="settings-safety-row">
            <div class="settings-safety-meta">
              <strong>${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(u.name, u) : u.name}</strong>
              ${u.username ? `<span class="toggle-desc">@${u.username}</span>` : ''}
              ${u.reason ? `<span class="toggle-desc">${u.reason}</span>` : ''}
            </div>
            <button type="button" class="btn btn--secondary" data-settings-unreport="${u.uid}" data-flag="${u.flagId || ''}" data-name="${(u.name || '').replace(/"/g, '&quot;')}">Remove report</button>
          </div>`
          )
          .join('');
        reportedHost.querySelectorAll('[data-settings-unreport]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            await withdrawReport(btn.dataset.settingsUnreport, {
              flagId: btn.dataset.flag || null,
              name: btn.dataset.name,
              fromSettings: true,
              requireReason: true,
            });
            renderSettingsSafetyLists();
          });
        });
      }
    }
  }

  function refreshSettingsSafetyLists() {
    return renderSettingsSafetyLists();
  }

  /**
   * Balanced post ⋮ menu — constructive + safety, with Report cascade.
   * @param {object} content - peepal question or duniya post
   * @param {object} [opts]
   * @param {'peepal'|'duniya'} [opts.surface]
   */
  function openContentMenu(content, opts = {}) {
    const surface = opts.surface || 'peepal';
    const user = content?.user || { uid: content?.uid, name: 'User' };
    const postId = content?.id || content?.firestoreId || opts.postId || null;
    const authorUid = user?.uid || content?.uid || null;
    const isOwn =
      typeof currentUser !== 'undefined' &&
      currentUser &&
      authorUid &&
      (authorUid === currentUser.uid || content?.uid === currentUser.uid);

    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const shareUrl = (() => {
      try {
        if (typeof buildShareUrl === 'function') return buildShareUrl(surface, postId);
      } catch (e) {}
      try {
        const base = location.origin || '';
        if (surface === 'duniya' && postId) return `${base}/post/${postId}`;
        if (surface === 'peepal' && postId) return `${base}/peepal/${postId}`;
      } catch (e) {}
      return '';
    })();

    const hideContentLocally = () => {
      try {
        if (surface === 'peepal' && typeof peepalQuestions !== 'undefined' && Array.isArray(peepalQuestions)) {
          peepalQuestions = peepalQuestions.filter((q) => q.id !== content.id && q.firestoreId !== content.id);
          if (typeof renderPeepalFeed === 'function') renderPeepalFeed();
        }
        if (surface === 'duniya' && typeof duniyaPosts !== 'undefined' && Array.isArray(duniyaPosts)) {
          duniyaPosts = duniyaPosts.filter((p) => p.id !== content.id);
          if (typeof renderDuniyaFeed === 'function') renderDuniyaFeed();
        }
      } catch (e) {}
    };

    const runInterest = async (signal) => {
      try {
        if (typeof recordContentInterest === 'function') {
          await recordContentInterest({
            postId,
            surface,
            signal,
            authorUid,
            tag: content?.tag || '',
          });
        }
        if (authorUid && typeof recordDiscoveryInterest === 'function') {
          recordDiscoveryInterest(authorUid, signal === 'more_like');
        }
        if (signal === 'not_interested') hideContentLocally();
        if (typeof showToast === 'function') {
          showToast(
            signal === 'more_like'
              ? "Noted — we'll show more like this"
              : "Got it — we'll show less like this"
          );
        }
      } catch (e) {
        if (typeof showToast === 'function') {
          showToast(typeof friendlyError === 'function' ? friendlyError(e) : 'Could not save preference');
        }
      }
    };

    const menuIco = (name) =>
      typeof iconHtml === 'function' ? iconHtml(name, { size: 18, className: 'cp-menu-icon' }) : '';

    const items = [];
    if (!isOwn && authorUid) {
      items.push({ id: 'more_like', label: 'More like this', icon: 'heart' });
      items.push({ id: 'not_interested', label: 'Not interested', icon: 'thumbs-down' });
    }
    // Peepal cards already expose Share on the footer action bar — one affordance.
    if (surface !== 'peepal') {
      items.push({ id: 'share', label: 'Share', icon: 'share' });
    }
    if (shareUrl) items.push({ id: 'copy', label: 'Copy link', icon: 'link' });
    if (!isOwn && authorUid) {
      items.push({ id: 'hide', label: 'Hide', icon: 'eye-off' });
      items.push({ id: 'report', label: 'Report…', icon: 'triangle-alert', danger: true });
      items.push({ id: 'block', label: `Block ${user.name || 'user'}`, icon: 'ban', danger: true });
    }

    const bodyHtml = `<div class="cp-post-menu-list cp-menu-list" role="menu">
      ${items
        .map(
          (it) =>
            `<button type="button" class="cp-menu-item cp-post-menu-item${it.danger ? ' is-danger' : ''}" data-menu-act="${it.id}" role="menuitem">
              <span class="cp-menu-ico cp-post-menu-ico" aria-hidden="true">${menuIco(it.icon)}</span>
              <span>${esc(it.label)}</span>
            </button>`
        )
        .join('')}
    </div>`;

    const handleAct = async (act, close) => {
      if (act === 'more_like') {
        if (close) close();
        await runInterest('more_like');
        return;
      }
      if (act === 'not_interested') {
        if (close) close();
        await runInterest('not_interested');
        return;
      }
      if (act === 'share') {
        if (close) close();
        if (typeof openShareSheet === 'function') openShareSheet(content);
        else if (navigator.share) {
          navigator
            .share({
              title: 'Chaupaal',
              text: String(content.question || content.caption || '').slice(0, 120),
              url: shareUrl || undefined,
            })
            .catch(() => {});
        }
        return;
      }
      if (act === 'copy') {
        if (close) close();
        try {
          await navigator.clipboard.writeText(shareUrl);
          if (typeof showToast === 'function') showToast('Link copied');
        } catch (e) {
          if (typeof showToast === 'function') showToast('Could not copy link');
        }
        return;
      }
      if (act === 'hide') {
        if (close) close();
        hideContentLocally();
        if (typeof showToast === 'function') showToast('Hidden from your feed');
        return;
      }
      if (act === 'report') {
        if (close) close();
        openFlagSheet(user, { postId, targetType: surface });
        return;
      }
      if (act === 'block') {
        if (close) close();
        try {
          await blockUser(authorUid, user.name);
        } catch (e) {
          if (typeof showToast === 'function') showToast("Couldn't block — try again");
        }
      }
    };

    if (typeof openHalfSheet === 'function') {
      openHalfSheet({
        id: 'cpContentMenu',
        title: 'Post options',
        accent: surface === 'duniya' ? 'duniya' : 'peepal',
        snap: 'mid',
        bodyHtml,
        onMount: (sheet, close) => {
          sheet.querySelectorAll('[data-menu-act]').forEach((btn) => {
            btn.addEventListener('click', () => handleAct(btn.dataset.menuAct, close));
          });
        },
      });
      return;
    }

    if (typeof showActionSheet === 'function') {
      showActionSheet(
        'Post options',
        items.map((it) => ({
          label: it.label,
          icon: it.icon,
          danger: !!it.danger,
          fn: () => handleAct(it.id, null),
        }))
      );
    }
  }

  window.REPORT_REASONS = REPORT_REASONS;
  window.FLAG_REASONS = FLAG_REASONS;
  window.SAFETY_UNDO_REASONS = SAFETY_UNDO_REASONS;
  window.blockUser = blockUser;
  window.unblockUser = unblockUser;
  window.flagUser = flagUser;
  window.withdrawReport = withdrawReport;
  window.openFlagSheet = openFlagSheet;
  window.openContentMenu = openContentMenu;
  window.openBlockedUsersSheet = openBlockedUsersSheet;
  window.loadBlockedFromFirestore = loadBlockedFromFirestore;
  window.listBlockedUsers = listBlockedUsers;
  window.listReportedUsers = listReportedUsers;
  window.renderSettingsSafetyLists = renderSettingsSafetyLists;
  window.refreshSettingsSafetyLists = refreshSettingsSafetyLists;
})();
