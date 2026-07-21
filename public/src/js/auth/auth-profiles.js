/**
 * Multi-profile under one Firebase Auth identity (Instagram-style switcher).
 * No hard create cap — unlimited profiles owned; device stays signed in until logout.
 *
 * @see .cursor/rules/auth-identity.mdc
 */
(function () {
  'use strict';

  const ACTIVE_KEY = 'chaupaal_active_profile_id';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function profileId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeUsername(u) {
    return String(u || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30);
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
      tx.set(ref, { uid, profileId: pid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
    await db.collection('users').doc(uid).collection('profiles').doc(pid).set({ username: next, usernameLower: next }, { merge: true });
    if (window.activeProfileId === pid) {
      await applyActiveProfileToUserDoc(uid, pid);
    }
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
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    } catch (e) {}
    // Legacy: single profile on user doc
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

  async function switchProfile(uid, pid) {
    const p = await applyActiveProfileToUserDoc(uid, pid);
    if (typeof showToast === 'function') showToast(`Switched to @${p?.username || 'profile'}`);
    return p;
  }

  async function setActiveProfile(uid, pid) {
    return applyActiveProfileToUserDoc(uid, pid);
  }

  function getStoredActiveProfileId() {
    try {
      return localStorage.getItem(ACTIVE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  async function hydrateActiveProfile(uid, userDoc) {
    let pid = userDoc?.activeProfileId || getStoredActiveProfileId();
    const profiles = await listProfiles(uid);
    if (!profiles.length) {
      const created = await ensurePrimaryProfileFromUserDoc(uid, userDoc);
      if (created) pid = created.id;
    }
    if (!pid && profiles[0]) pid = profiles[0].id;
    if (pid) await applyActiveProfileToUserDoc(uid, pid);
    return pid;
  }

  function openProfileSwitcher() {
    if (!currentUser) return;
    document.getElementById('cpProfileSwitcher')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'cpProfileSwitcher';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-ps-close aria-label="Back">←</button>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Switch profile</div>
      </div>
      <div class="group-info-scroll" style="padding:16px;" data-ps-list>
        <div style="color:var(--muted);font-size:13px;">Loading…</div>
      </div>
      <div style="padding:12px 16px 24px;">
        <button type="button" class="btn btn--primary btn--block" data-ps-add>+ Add profile</button>
        <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px;line-height:1.4;">Instagram-style — unlimited profiles under this login. Stay signed in until you log out.</div>
      </div>`;
    const device = document.querySelector('.device') || document.body;
    device.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-ps-close]')?.addEventListener('click', close);

    (async () => {
      const list = await listProfiles(currentUser.uid);
      const active = window.activeProfileId || getStoredActiveProfileId();
      const el = sheet.querySelector('[data-ps-list]');
      el.innerHTML = list
        .map(
          (p) => `<button type="button" class="group-info-member" data-ps-id="${esc(p.id)}" style="width:100%;border:none;cursor:pointer;text-align:left;margin-bottom:6px;">
          <div class="group-info-member-av">${p.photoURL ? `<img src="${esc(p.photoURL)}" alt="">` : '👤'}</div>
          <div class="group-info-member-meta">
            <div class="group-info-member-name">@${esc(p.username || 'user')}${p.id === active ? ' · active' : ''}</div>
            <div style="font-size:12px;color:var(--muted);">${esc(p.name || '')}</div>
          </div>
        </button>`
        )
        .join('') || `<div style="color:var(--muted);font-size:13px;">No profiles yet</div>`;
      el.querySelectorAll('[data-ps-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await switchProfile(currentUser.uid, btn.dataset.psId);
          close();
        });
      });
    })();

    sheet.querySelector('[data-ps-add]')?.addEventListener('click', async () => {
      const name =
        typeof promptNameSheet === 'function'
          ? await promptNameSheet({ title: 'New profile name', placeholder: 'Display name', confirmLabel: 'Next' })
          : null;
      if (!name) return;
      const uname =
        typeof promptNameSheet === 'function'
          ? await promptNameSheet({
              title: 'Choose username',
              placeholder: 'unique_handle',
              confirmLabel: 'Create',
              defaultValue: String(name).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20),
            })
          : null;
      if (!uname) return;
      try {
        const created = await createProfile(currentUser.uid, { name: String(name).trim(), username: uname });
        await switchProfile(currentUser.uid, created.id);
        close();
        if (typeof showToast === 'function') showToast(`Created @${created.username}`);
      } catch (e) {
        if (typeof showToast === 'function') {
          showToast(e.code === 'username-taken' ? 'Username taken' : 'Could not create profile');
        }
      }
    });
  }

  window.AuthProfiles = {
    createProfile,
    listProfiles,
    switchProfile,
    setActiveProfile,
    renameUsername,
    hydrateActiveProfile,
    ensurePrimaryProfileFromUserDoc,
    openProfileSwitcher,
    claimUsername,
    normalizeUsername,
  };
  window.openProfileSwitcher = openProfileSwitcher;
})();
