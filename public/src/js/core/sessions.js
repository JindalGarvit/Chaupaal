/**
 * Session / device management (Phase 3).
 *
 * Firebase Auth does not expose a multi-device session list on the client.
 * We mirror each browser session into users/{uid}/sessions/{sessionId}.
 *
 * Logout strategies:
 * - This device: auth.signOut() + mark session ended
 * - Other device: mark session revoked; that client polls and signOuts locally
 * - All devices: mark all revoked + POST /api/revoke-sessions (Admin
 *   revokeRefreshTokens) when service account is configured; otherwise
 *   Firestore-only soft revoke (other tabs still sign out via heartbeat)
 */
(function () {
  const SESSION_KEY = 'chaupaal_session_id';
  const HEARTBEAT_MS = 60 * 1000;

  let heartbeatTimer = null;
  let sessionUnsub = null;

  function getOrCreateSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function deviceLabel() {
    const ua = navigator.userAgent || '';
    let browser = 'Browser';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
    let os = 'Device';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad/.test(ua)) os = 'iOS';
    else if (/Mac OS/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return `${browser} · ${os}`;
  }

  function sessionRef(uid, sid) {
    return db.collection('users').doc(uid).collection('sessions').doc(sid);
  }

  async function registerSession() {
    if (!db || !currentUser) return null;
    const sid = getOrCreateSessionId();
    const payload = {
      sessionId: sid,
      label: deviceLabel(),
      userAgent: (navigator.userAgent || '').slice(0, 240),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
      revoked: false,
      ended: false,
    };
    try {
      await sessionRef(currentUser.uid, sid).set(payload, { merge: true });
    } catch (e) {
      console.warn('[sessions] register failed', e);
    }
    startSessionWatch(sid);
    startHeartbeat(sid);
    return sid;
  }

  function startHeartbeat(sid) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!db || !currentUser) return;
      sessionRef(currentUser.uid, sid)
        .update({ lastActiveAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(() => {});
    }, HEARTBEAT_MS);
  }

  function startSessionWatch(sid) {
    if (sessionUnsub) {
      sessionUnsub();
      sessionUnsub = null;
    }
    if (!db || !currentUser) return;
    sessionUnsub = sessionRef(currentUser.uid, sid).onSnapshot((snap) => {
      const data = snap.data();
      if (data && (data.revoked || data.ended)) {
        forceLocalLogout(t('settings.signed_out_from_another_device'));
      }
    });
  }

  async function forceLocalLogout(msg) {
    clearInterval(heartbeatTimer);
    if (sessionUnsub) {
      sessionUnsub();
      sessionUnsub = null;
    }
    try {
      if (auth) await auth.signOut();
    } catch (e) {}
    if (typeof stopNotifInbox === 'function') stopNotifInbox();
    if (typeof stopChatPresence === 'function') stopChatPresence();
    currentUser = null;
    userProfile = null;
    if (typeof showToast === 'function') showToast(msg || t('settings.signed_out'));
  }

  async function listSessions() {
    if (!db || !currentUser) return [];
    const snap = await db
      .collection('users')
      .doc(currentUser.uid)
      .collection('sessions')
      .orderBy('lastActiveAt', 'desc')
      .limit(20)
      .get();
    const currentId = getOrCreateSessionId();
    return snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        label: data.label || t('settings.unknown_device'),
        lastActiveAt: data.lastActiveAt?.toMillis?.() || data.lastActiveAt || null,
        revoked: !!data.revoked,
        ended: !!data.ended,
        current: d.id === currentId,
      };
    }).filter((s) => !s.ended);
  }

  async function logoutSession(sessionId) {
    if (!db || !currentUser || !sessionId) return;
    const currentId = getOrCreateSessionId();
    if (sessionId === currentId) {
      await sessionRef(currentUser.uid, sessionId).set({ ended: true, revoked: true }, { merge: true });
      await forceLocalLogout(t('settings.logged_out'));
      return;
    }
    await sessionRef(currentUser.uid, sessionId).set(
      { revoked: true, revokedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    if (typeof showToast === 'function') showToast(t('settings.device_signed_out'));
  }

  async function logoutAllSessions() {
    if (!db || !currentUser) return;
    const snap = await db.collection('users').doc(currentUser.uid).collection('sessions').get();
    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.set(d.ref, { revoked: true, ended: true, revokedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    await batch.commit();

    // Best-effort Auth token revoke (needs Admin creds on Vercel)
    try {
      const token = await auth.currentUser.getIdToken();
      const key = typeof newIdempotencyKey === 'function' ? newIdempotencyKey('revoke') : `revoke_${Date.now()}`;
      await fetch('/api/revoke-sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ all: true, targetUid: currentUser.uid }),
      });
    } catch (e) {
      console.warn('[sessions] admin revoke unavailable', e);
    }

    await forceLocalLogout(t('settings.logged_out_of_all_devices'));
  }

  async function openSessionsSheet() {
    if (!currentUser) {
      if (typeof showToast === 'function') showToast(t('settings.sign_in_to_manage_devices'));
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ id: 'sessionsBack' }):'<button id="sessionsBack" class="cp-back-btn" aria-label="' + tHtml('common.back') + '">←</button>'}
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">${tHtml('common.devices_sessions')}</div>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:var(--muted);">${tHtml('settings.sign_out_a_single_device_or')}</div>
      <div id="sessionsList" style="flex:1;overflow:auto;padding:0 16px 24px;"></div>
      <div style="padding:12px 16px 24px;">
        <button type="button" class="btn btn--primary btn--block ui-state-btn ui-state-btn-primary" id="logoutAllDevices" style="width:100%;">${tHtml('settings.log_out_of_all_devices')}</button>
      </div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('#sessionsBack')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#logoutAllDevices')?.addEventListener('click', async () => {
      const ok =
        typeof confirmSheet === 'function'
          ? await confirmSheet({
              title: t('settings.log_out_everywhere'),
              message: t('settings.sign_out_of_chaupaal_on_every'),
              confirmLabel: t('settings.log_out_all'),
              danger: true,
            })
          : false;
      if (!ok) return;
      overlay.remove();
      await logoutAllSessions();
    });

    const list = overlay.querySelector('#sessionsList');
    if (typeof renderSkeleton === 'function') renderSkeleton(list, { variant: 'list', count: 2 });
    try {
      const sessions = await listSessions();
      if (!sessions.length) {
        if (typeof renderEmptyState === 'function') {
          renderEmptyState(list, { icon: '💻', title: t('settings.no_sessions_yet'), message: t('settings.this_device_will_appear_after_the') });
        }
        return;
      }
      list.innerHTML = sessions
        .map((s) => {
          const active =
            typeof formatRelativeTime === 'function' && s.lastActiveAt
              ? tHtml('settings.session_active_when', { when: formatRelativeTime(s.lastActiveAt) })
              : tHtml('settings.session_active_recently');
          return `<div class="recovery-row">
            <div class="recovery-preview">${s.label}${s.current ? ' · <strong>' + tHtml('settings.this_device') + '</strong>' : ''}${s.revoked ? ' · ' + tHtml('settings.session_revoked') : ''}</div>
            <div class="recovery-meta">${active}</div>
            ${s.revoked ? '' : `<button type="button" class="btn btn--secondary ui-state-btn" data-sid="${s.id}">${s.current ? tHtml('settings.log_out_here') : tHtml('settings.log_out_device')}</button>`}
          </div>`;
        })
        .join('');
      list.querySelectorAll('[data-sid]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await logoutSession(btn.dataset.sid);
          overlay.remove();
          if (btn.dataset.sid !== getOrCreateSessionId()) openSessionsSheet();
        });
      });
    } catch (e) {
      if (typeof renderErrorState === 'function') {
        renderErrorState(list, {
          title: t('settings.couldn_t_load_sessions'),
          message: typeof friendlyError === 'function' ? friendlyError(e) : t('settings.try_again'),
          onRetry: () => {
            overlay.remove();
            openSessionsSheet();
          },
        });
      }
    }
  }

  function endCurrentSessionQuietly() {
    if (!db || !currentUser) return;
    const sid = localStorage.getItem(SESSION_KEY);
    if (!sid) return;
    sessionRef(currentUser.uid, sid)
      .set({ ended: true }, { merge: true })
      .catch(() => {});
  }

  window.registerSession = registerSession;
  window.listSessions = listSessions;
  window.logoutSession = logoutSession;
  window.logoutAllSessions = logoutAllSessions;
  window.openSessionsSheet = openSessionsSheet;
  window.endCurrentSessionQuietly = endCurrentSessionQuietly;
  window.getOrCreateSessionId = getOrCreateSessionId;
})();
