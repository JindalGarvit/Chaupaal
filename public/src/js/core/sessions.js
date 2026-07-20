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
        forceLocalLogout('Signed out from another device');
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
    currentUser = null;
    userProfile = null;
    if (typeof showToast === 'function') showToast(msg || 'Signed out');
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
        label: data.label || 'Unknown device',
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
      await forceLocalLogout('Logged out');
      return;
    }
    await sessionRef(currentUser.uid, sessionId).set(
      { revoked: true, revokedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    if (typeof showToast === 'function') showToast('Device signed out');
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

    await forceLocalLogout('Logged out of all devices');
  }

  async function openSessionsSheet() {
    if (!currentUser) {
      if (typeof showToast === 'function') showToast('Sign in to manage devices');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button id="sessionsBack" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Devices & sessions</div>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:var(--muted);">Sign out a single device, or everywhere at once.</div>
      <div id="sessionsList" style="flex:1;overflow:auto;padding:0 16px 24px;"></div>
      <div style="padding:12px 16px 24px;">
        <button type="button" class="btn btn--primary btn--block ui-state-btn ui-state-btn-primary" id="logoutAllDevices" style="width:100%;">Log out of all devices</button>
      </div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('#sessionsBack')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#logoutAllDevices')?.addEventListener('click', async () => {
      const ok =
        typeof confirmSheet === 'function'
          ? await confirmSheet({
              title: 'Log out everywhere?',
              message: 'Sign out of Chaupaal on every device?',
              confirmLabel: 'Log out all',
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
          renderEmptyState(list, { icon: '💻', title: 'No sessions yet', message: 'This device will appear after the next refresh.' });
        }
        return;
      }
      list.innerHTML = sessions
        .map((s) => {
          const when =
            typeof formatRelativeTime === 'function' && s.lastActiveAt
              ? formatRelativeTime(s.lastActiveAt)
              : 'recently';
          return `<div class="recovery-row">
            <div class="recovery-preview">${s.label}${s.current ? ' · <strong>This device</strong>' : ''}${s.revoked ? ' · revoked' : ''}</div>
            <div class="recovery-meta">Active ${when}</div>
            ${s.revoked ? '' : `<button type="button" class="btn btn--secondary ui-state-btn" data-sid="${s.id}">${s.current ? 'Log out here' : 'Log out device'}</button>`}
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
          title: 'Couldn’t load sessions',
          message: typeof friendlyError === 'function' ? friendlyError(e) : 'Try again',
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
