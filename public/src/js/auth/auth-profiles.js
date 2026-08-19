/**
 * Device multi-account switcher (Instagram-style) + username registry helpers.
 *
 * Persistence: localStorage `chaupaal_device_accounts` holds slots with
 * refreshToken for instant switch via server customToken (switch_account).
 * Fallback: soft sign-out + login prefilled for that account.
 *
 * Personal vs Professional = separate Firebase accounts (set at signup),
 * NOT a same-login toggle. Old same-account profile flip is retired.
 *
 * Username claim / rename still lives here for signup & handle changes.
 */
(function () {
  'use strict';

  const ACCOUNTS_KEY = 'chaupaal_device_accounts';
  const ACTIVE_KEY = 'chaupaal_active_profile_id';
  const BIOMETRIC_STUB_KEY = 'chaupaal_biometric_pref';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeUsername(u) {
    return String(u || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30);
  }

  function profileId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function claimUsername(username, uid, pid) {
    const uname = normalizeUsername(username);
    if (!uname || uname.length < 3) throw new Error('USERNAME_INVALID');
    const ref = db.collection('usernames').doc(uname);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const d = snap.data() || {};
        if (d.uid !== uid || (d.profileId && d.profileId !== pid)) {
          throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'username-taken' });
        }
      }
      tx.set(ref, {
        uid,
        profileId: pid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    return uname;
  }

  /** Rename: frees old username immediately (Rename A). */
  async function renameUsername(uid, pid, oldUsername, newUsername) {
    const next = normalizeUsername(newUsername);
    if (!next || next.length < 3) throw new Error('USERNAME_INVALID');
    if (next === normalizeUsername(oldUsername)) return next;
    await claimUsername(next, uid, pid);
    if (oldUsername && normalizeUsername(oldUsername) !== next) {
      try {
        const oldRef = db.collection('usernames').doc(normalizeUsername(oldUsername));
        const snap = await oldRef.get();
        if (snap.exists && snap.data()?.uid === uid && snap.data()?.profileId === pid) {
          await oldRef.delete();
        }
      } catch (e) {}
    }
    await db
      .collection('users')
      .doc(uid)
      .collection('profiles')
      .doc(pid)
      .set({ username: next, usernameLower: next }, { merge: true });
    await db
      .collection('users')
      .doc(uid)
      .set({ username: next, usernameLower: next }, { merge: true });
    try {
      if (typeof UsersPublic?.syncPublicProfile === 'function' && typeof userProfile !== 'undefined') {
        await UsersPublic.syncPublicProfile(uid, {
          ...(userProfile || {}),
          username: next,
          usernameLower: next,
        });
      }
    } catch (e) {}
    return next;
  }

  async function createProfile(uid, fields) {
    const pid = fields.id || profileId();
    const username = await claimUsername(fields.username, uid, pid);
    const doc = {
      id: pid,
      username,
      usernameLower: username,
      name: String(fields.name || '').slice(0, 80),
      nameLower: String(fields.name || '')
        .toLowerCase()
        .trim(),
      photoURL: fields.photoURL || '',
      photoThumb: fields.photoThumb || null,
      profileType: fields.profileType === 'professional' ? 'professional' : 'personal',
      gender: fields.gender || '',
      dob: fields.dob || '',
      age: fields.age || 0,
      city: fields.city || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      ownerUid: uid,
    };
    await db.collection('users').doc(uid).collection('profiles').doc(pid).set(doc);
    return { ...doc, id: pid, username };
  }

  async function listProfiles(uid) {
    if (!db || !uid) return [];
    try {
      const snap = await db.collection('users').doc(uid).collection('profiles').get();
      if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {}
    try {
      const u = await db.collection('users').doc(uid).get();
      if (!u.exists) return [];
      const d = u.data() || {};
      if (!d.username && !d.name) return [];
      return [
        {
          id: d.activeProfileId || 'primary',
          username: d.username,
          name: d.name,
          photoURL: d.photoURL,
          profileType: d.profileType || 'personal',
          legacy: true,
        },
      ];
    } catch (e) {
      return [];
    }
  }

  async function ensurePrimaryProfileFromUserDoc(uid, userDoc) {
    const existing = await listProfiles(uid);
    if (existing.length && !existing[0].legacy) return existing[0];
    if (!userDoc?.username) return null;
    const created = await createProfile(uid, {
      id: 'primary',
      username: userDoc.username,
      name: userDoc.name,
      photoURL: userDoc.photoURL,
      photoThumb: userDoc.photoThumb,
      profileType: userDoc.profileType,
      gender: userDoc.gender,
      dob: userDoc.dob || userDoc.dateOfBirth,
      age: userDoc.age,
      city: userDoc.city,
    });
    await db.collection('users').doc(uid).set({ activeProfileId: created.id }, { merge: true });
    return created;
  }

  async function applyActiveProfileToUserDoc(uid, pid) {
    const snap = await db.collection('users').doc(uid).collection('profiles').doc(pid).get();
    if (!snap.exists) return null;
    const p = snap.data() || {};
    const patch = {
      activeProfileId: pid,
      name: p.name || '',
      username: p.username || '',
      usernameLower: p.usernameLower || p.username || '',
      nameLower: p.nameLower || '',
      photoURL: p.photoURL || '',
      photoThumb: p.photoThumb || null,
      profileType: p.profileType || 'personal',
      gender: p.gender || '',
      dob: p.dob || '',
      age: p.age || 0,
      city: p.city || '',
      profile: {
        displayName: p.name || '',
        username: p.username || '',
        profileType: p.profileType || 'personal',
        gender: p.gender || '',
        currentCity: p.city || '',
        dateOfBirth: p.dob || '',
        age: p.age || 0,
      },
    };
    await db.collection('users').doc(uid).set(patch, { merge: true });
    try {
      localStorage.setItem(ACTIVE_KEY, pid);
    } catch (e) {}
    window.activeProfileId = pid;
    if (typeof userProfile !== 'undefined') {
      userProfile = { ...(userProfile || {}), ...p, uid, activeProfileId: pid, name: p.name, username: p.username };
    }
    if (typeof updateProfileBtn === 'function') updateProfileBtn();
    return p;
  }

  async function hydrateActiveProfile(uid, userDoc) {
    let pid = userDoc?.activeProfileId || null;
    try {
      pid = pid || localStorage.getItem(ACTIVE_KEY);
    } catch (e) {}
    const profiles = await listProfiles(uid);
    if (!profiles.length) {
      const created = await ensurePrimaryProfileFromUserDoc(uid, userDoc);
      if (created) pid = created.id;
    }
    if (!pid && profiles[0]) pid = profiles[0].id;
    if (pid) {
      try {
        await applyActiveProfileToUserDoc(uid, pid);
      } catch (e) {
        window.activeProfileId = pid;
      }
    }
    return pid;
  }

  /* ─── Device multi-account slots ─────────────────────────────────────── */

  function readDeviceAccounts() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((a) => a && a.uid) : [];
    } catch (e) {
      return [];
    }
  }

  function writeDeviceAccounts(list) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, 40)));
    } catch (e) {}
  }

  function upsertDeviceAccount(partial) {
    if (!partial?.uid) return;
    const list = readDeviceAccounts().filter((a) => a.uid !== partial.uid);
    list.unshift({
      uid: partial.uid,
      email: partial.email || '',
      phone: partial.phone || '',
      username: partial.username || '',
      name: partial.name || '',
      photoURL: partial.photoURL || '',
      profileType: partial.profileType === 'professional' ? 'professional' : 'personal',
      refreshToken: partial.refreshToken || '',
      lastUsed: partial.lastUsed || Date.now(),
    });
    writeDeviceAccounts(list);
  }

  function removeDeviceAccount(uid) {
    writeDeviceAccounts(readDeviceAccounts().filter((a) => a.uid !== uid));
  }

  function rememberCurrentAccount() {
    const u = auth?.currentUser;
    if (!u) return null;
    const slot = {
      uid: u.uid,
      email: u.email || '',
      phone: u.phoneNumber || '',
      username: (typeof userProfile !== 'undefined' && userProfile?.username) || '',
      name:
        (typeof userProfile !== 'undefined' && userProfile?.name) ||
        u.displayName ||
        '',
      photoURL:
        (typeof userProfile !== 'undefined' && userProfile?.photoURL) || u.photoURL || '',
      profileType:
        (typeof userProfile !== 'undefined' &&
          (userProfile?.profileType || userProfile?.profile?.profileType)) ||
        'personal',
      refreshToken: u.refreshToken || '',
      lastUsed: Date.now(),
    };
    upsertDeviceAccount(slot);
    if (typeof rememberLastUser === 'function') {
      rememberLastUser({
        uid: slot.uid,
        username: slot.username,
        name: slot.name,
        photoURL: slot.photoURL,
      });
    }
    return slot;
  }

  async function refreshChromeAfterSwitch() {
    try {
      if (typeof recoverNavStack === 'function') recoverNavStack();
    } catch (e) {}
    try {
      document.querySelectorAll('.archive-overlay, .chaupaal-hub-overlay, #cpAccountSwitcher').forEach((el) => {
        try {
          if (typeof removeNavLayer === 'function') removeNavLayer(el);
        } catch (err) {}
        el.remove();
      });
    } catch (e) {}
    if (typeof updateProfileBtn === 'function') updateProfileBtn();
    if (typeof loadStreak === 'function') loadStreak();
    if (typeof initActivityStatus === 'function') initActivityStatus();
    if (typeof startNotifInbox === 'function') startNotifInbox();
    if (typeof syncEmailVerifyBanner === 'function') syncEmailVerifyBanner();
    if (typeof registerSession === 'function') {
      try {
        await registerSession();
      } catch (e) {}
    }
    document.dispatchEvent(new CustomEvent('chaupaal:account-switched'));
  }

  async function switchToAccount(uid) {
    const slot = readDeviceAccounts().find((a) => a.uid === uid);
    if (!slot) throw new Error('Account not on this device');
    if (auth?.currentUser?.uid === uid) {
      if (typeof showToast === 'function') showToast('Already signed in as this account');
      return { ok: true, same: true };
    }

    rememberCurrentAccount();

    if (slot.refreshToken && typeof apiFetch === 'function') {
      try {
        const env = await apiFetch('/api/media-config', {
          method: 'POST',
          body: { action: 'switch_account', refreshToken: slot.refreshToken },
        });
        if (env?.ok && env.data?.customToken) {
          if (typeof endCurrentSessionQuietly === 'function') endCurrentSessionQuietly();
          await auth.signInWithCustomToken(env.data.customToken);
          if (env.data.refreshToken) {
            upsertDeviceAccount({ ...slot, refreshToken: env.data.refreshToken, lastUsed: Date.now() });
          } else {
            rememberCurrentAccount();
          }
          await refreshChromeAfterSwitch();
          if (typeof showToast === 'function') {
            showToast(
              typeof t === 'function'
                ? t('auth_switched_account', { username: slot.username || slot.name || 'account' })
                : 'Switched account'
            );
          }
          return { ok: true, instant: true };
        }
      } catch (e) {
        console.warn('[accounts] switch_account', e?.message || e);
      }
    }

    /* Fallback: leave slot, show login for that identity */
    if (typeof endCurrentSessionQuietly === 'function') endCurrentSessionQuietly();
    try {
      await auth.signOut();
    } catch (e) {}
    currentUser = null;
    userProfile = null;
    if (typeof showAuth === 'function') showAuth();
    showAuthScreenSafe('authLoginScreen');
    const id =
      slot.username || slot.email || (slot.phone ? slot.phone.replace(/^\+91/, '') : '');
    const idInp = document.getElementById('loginIdentifier');
    if (idInp && id) idInp.value = id;
    if (typeof showToast === 'function') {
      showToast('Sign in to continue as @' + (slot.username || slot.name || 'user'));
    }
    return { ok: true, needsCredential: true };
  }

  function showAuthScreenSafe(id) {
    if (typeof showAuthScreen === 'function') showAuthScreen(id);
    else {
      document.getElementById('authOverlay')?.classList.remove('hidden');
      document.querySelectorAll('.auth-form-screen, .auth-hero-screen').forEach((el) => {
        el.classList.toggle('hidden', el.id !== id);
      });
    }
  }

  async function removeAccountFromDevice(uid) {
    const active = auth?.currentUser?.uid === uid;
    removeDeviceAccount(uid);
    if (active) {
      if (typeof endCurrentSessionQuietly === 'function') endCurrentSessionQuietly();
      try {
        await auth.signOut();
      } catch (e) {}
      currentUser = null;
      userProfile = null;
      const rest = readDeviceAccounts();
      if (rest[0]) {
        await switchToAccount(rest[0].uid);
      } else if (typeof showAuth === 'function') {
        showAuth();
      }
    }
  }

  function openAddAccountFlow({ mode } = {}) {
    rememberCurrentAccount();
    window.__chaupaalAddingAccount = true;
    (async () => {
      if (typeof endCurrentSessionQuietly === 'function') endCurrentSessionQuietly();
      try {
        if (auth?.currentUser) await auth.signOut();
      } catch (e) {}
      currentUser = null;
      userProfile = null;
      if (typeof showAuth === 'function') {
        document.getElementById('authOverlay')?.classList.remove('hidden');
        if (mode === 'signup') {
          if (typeof enterAuthCanvasCreate === 'function') enterAuthCanvasCreate();
          else if (typeof window.emptyRegData === 'function') {
            /* canvas helpers may load after */
          }
          showAuthScreenSafe('authRegStep1');
        } else {
          showAuthScreenSafe('authLoginScreen');
        }
      }
    })();
  }

  /** Biometric / device unlock — stub until WebAuthn wiring is product-ready. */
  function biometricStatus() {
    const supported =
      typeof window.PublicKeyCredential === 'function' ||
      !!(window.PublicKeyCredential && navigator.credentials);
    let pref = 'off';
    try {
      pref = localStorage.getItem(BIOMETRIC_STUB_KEY) || 'off';
    } catch (e) {}
    return { supported: !!supported, enabled: pref === 'on', stub: true };
  }

  function setBiometricPref(on) {
    try {
      localStorage.setItem(BIOMETRIC_STUB_KEY, on ? 'on' : 'off');
    } catch (e) {}
    if (typeof showToast === 'function') {
      showToast(
        on
          ? 'Device unlock noted — full biometric unlock ships in a later pass'
          : 'Device unlock preference cleared'
      );
    }
    return biometricStatus();
  }

  function openAccountSwitcher() {
    document.getElementById('cpAccountSwitcher')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'cpAccountSwitcher';
    sheet.className = 'archive-overlay auth-account-switcher';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-as-close' }):'<button type="button" data-as-close class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Accounts</div>
      </div>
      <div class="group-info-scroll auth-account-list" style="padding:16px;" data-as-list></div>
      <div style="padding:12px 16px 24px;display:flex;flex-direction:column;gap:8px;">
        <button type="button" class="btn btn--primary btn--block" data-as-add-login>Add account — Log in</button>
        <button type="button" class="btn btn--block" data-as-add-signup style="background:var(--cream);border:1.5px solid var(--line);">Add account — Sign up</button>
        <div style="font-size:11px;color:var(--muted);text-align:center;line-height:1.4;">
          Personal and Professional are separate accounts. Switch anytime — no hard limit.
        </div>
      </div>`;
    const device = document.querySelector('.device') || document.body;
    device.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof openLayer === 'function') {
      openLayer(sheet, close);
    } else if (typeof pushNavLayer === 'function') {
      pushNavLayer(sheet, close);
    }
    sheet.querySelector('[data-as-close]')?.addEventListener('click', close);

    const listEl = sheet.querySelector('[data-as-list]');
    if (typeof renderSkeleton === 'function') renderSkeleton(listEl, { variant: 'list', count: 3 });

    const paint = () => {
      rememberCurrentAccount();
      const list = readDeviceAccounts();
      const active = auth?.currentUser?.uid;
      const el = sheet.querySelector('[data-as-list]');
      if (!list.length) {
        el.innerHTML =
          '<div style="color:var(--muted);font-size:13px;line-height:1.45;">No saved accounts on this device yet. Stay signed in once, then add more.</div>';
        return;
      }
      el.innerHTML = list
        .map((a) => {
          const isActive = a.uid === active;
          const type =
            a.profileType === 'professional' ? 'Professional' : 'Personal';
          const handle = a.username ? '@' + a.username : a.email || a.phone || 'Account';
          return `<div class="auth-account-row${isActive ? ' is-active' : ''}" data-as-uid="${esc(a.uid)}">
            <button type="button" class="auth-account-main" data-as-switch="${esc(a.uid)}">
              <div class="auth-account-av">${
                typeof renderUserAvatarHtml==='function'
                  ? renderUserAvatarHtml(a,{decorative:true})
                  : a.photoURL
                  ? `<img src="${esc(a.photoURL)}" alt="">`
                  : esc((a.name || a.username || '?')[0].toUpperCase())
              }</div>
              <div class="auth-account-meta">
                <div class="auth-account-name">${esc(a.name || handle)}${
                  isActive ? ' <span class="auth-account-badge">Active</span>' : ''
                }</div>
                <div class="auth-account-sub">${esc(handle)} · ${type}</div>
              </div>
            </button>
            <button type="button" class="auth-account-remove" data-as-remove="${esc(
              a.uid
            )}" aria-label="Remove from device">✕</button>
          </div>`;
        })
        .join('');

      el.querySelectorAll('[data-as-switch]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await switchToAccount(btn.dataset.asSwitch);
            close();
          } catch (e) {
            if (typeof showToast === 'function') showToast(e.message || 'Could not switch');
            btn.disabled = false;
          }
        });
      });
      el.querySelectorAll('[data-as-remove]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = btn.dataset.asRemove;
          const ok =
            typeof confirmSheet === 'function'
              ? await confirmSheet({
                  title: 'Remove account?',
                  message: 'Signs out this account on this device only. You can add it again later.',
                  confirmLabel: 'Remove',
                  danger: true,
                })
              : true;
          if (!ok) return;
          await removeAccountFromDevice(uid);
          paint();
        });
      });
    };
    paint();

    sheet.querySelector('[data-as-add-login]')?.addEventListener('click', () => {
      close();
      openAddAccountFlow({ mode: 'login' });
    });
    sheet.querySelector('[data-as-add-signup]')?.addEventListener('click', () => {
      close();
      openAddAccountFlow({ mode: 'signup' });
    });
  }

  /* Back-compat aliases — old same-account profile switcher entry points */
  function openProfileSwitcher() {
    openAccountSwitcher();
  }

  async function switchProfile() {
    openAccountSwitcher();
  }

  window.AuthProfiles = {
    createProfile,
    listProfiles,
    switchProfile,
    setActiveProfile: applyActiveProfileToUserDoc,
    renameUsername,
    hydrateActiveProfile,
    ensurePrimaryProfileFromUserDoc,
    openProfileSwitcher,
    openAccountSwitcher,
    claimUsername,
    normalizeUsername,
    rememberCurrentAccount,
    listDeviceAccounts: readDeviceAccounts,
    switchToAccount,
    removeAccountFromDevice,
    openAddAccountFlow,
    biometricStatus,
    setBiometricPref,
  };
  window.openProfileSwitcher = openAccountSwitcher;
  window.openAccountSwitcher = openAccountSwitcher;
})();
