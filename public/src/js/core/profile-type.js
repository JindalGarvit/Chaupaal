/**
 * Profile type foundation — intentionally minimal.
 *
 * Schema: users/{uid}.profileType + users/{uid}.profile.profileType
 * Values: 'personal' | 'professional'
 *
 * "Professional" = businesses, media houses, content creators, or public figures
 * operating in a professional capacity — NOT a personal career/networking profile mode.
 *
 * EXTENSIBILITY POINT (do not remove): future pro-account features should branch on
 * getProfileType() / digitalProfile.profileType — e.g. business info fields, verified
 * badges, follower-style dynamics (vs mutual friends), and creator tools — without a
 * schema migration. Matching, field visibility, and badges are intentionally unchanged
 * for now; only the toggleable field exists.
 */
(function () {
  const VALID = new Set(['personal', 'professional']);

  function normalizeProfileType(v) {
    const t = String(v || 'personal').toLowerCase();
    return VALID.has(t) ? t : 'personal';
  }

  function getProfileType() {
    if (typeof digitalProfile !== 'undefined' && digitalProfile.profileType) {
      return normalizeProfileType(digitalProfile.profileType);
    }
    if (typeof userProfile !== 'undefined' && userProfile) {
      return normalizeProfileType(userProfile.profileType || userProfile.profile?.profileType);
    }
    return 'personal';
  }

  function saveProfileType(next) {
    const type = normalizeProfileType(next);
    if (typeof digitalProfile !== 'undefined') digitalProfile.profileType = type;
    try {
      if (typeof digitalProfile !== 'undefined') {
        localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
      }
    } catch (e) {}
    if (typeof userProfile !== 'undefined' && userProfile) {
      userProfile.profileType = type;
      userProfile.profile = userProfile.profile || {};
      userProfile.profile.profileType = type;
    }
    if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
      db.collection('users')
        .doc(currentUser.uid)
        .update({ profileType: type, 'profile.profileType': type })
        .catch(() => {});
    }
    return type;
  }

  function hydrateProfileTypeFromUserDoc(docData) {
    if (!docData || typeof digitalProfile === 'undefined') return;
    const type = normalizeProfileType(docData.profileType || docData.profile?.profileType);
    digitalProfile.profileType = type;
    try {
      localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
    } catch (e) {}
  }

  /** Compact toggle UI for profile settings (Social / account area). */
  function renderProfileTypeToggleHtml() {
    const type = getProfileType();
    return `
      <div class="profile-type-block" id="profileTypeBlock" style="margin:0 0 16px;padding:14px;border:1.5px solid var(--line);border-radius:14px;background:var(--cream);">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:4px;">Account type</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.4;">
          Personal for yourself · Professional for a business, media house, creator, or public figure.
        </div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="profile-type-opt${type === 'personal' ? ' active' : ''}" data-profile-type="personal"
            style="flex:1;padding:10px;border-radius:12px;border:2px solid ${type === 'personal' ? 'var(--red)' : 'var(--line)'};background:${type === 'personal' ? 'rgba(230,57,70,0.08)' : 'var(--white)'};color:${type === 'personal' ? 'var(--red)' : 'var(--ink)'};font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">
            Personal
          </button>
          <button type="button" class="profile-type-opt${type === 'professional' ? ' active' : ''}" data-profile-type="professional"
            style="flex:1;padding:10px;border-radius:12px;border:2px solid ${type === 'professional' ? 'var(--red)' : 'var(--line)'};background:${type === 'professional' ? 'rgba(230,57,70,0.08)' : 'var(--white)'};color:${type === 'professional' ? 'var(--red)' : 'var(--ink)'};font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">
            Professional
          </button>
        </div>
      </div>`;
  }

  function needsPersonalGender() {
    const g =
      (typeof digitalProfile !== 'undefined' && digitalProfile.gender) ||
      (typeof userProfile !== 'undefined' && (userProfile.gender || userProfile.profile?.gender)) ||
      '';
    return !String(g || '').trim();
  }

  function promptPersonalGenderIfNeeded() {
    if (typeof getProfileType === 'function' && getProfileType() !== 'personal') return;
    if (!needsPersonalGender()) return;
    const existing = document.getElementById('profileGenderPrompt');
    if (existing) return;

    const host =
      document.getElementById('profileTypeBlock')?.parentElement ||
      document.getElementById('profileContent') ||
      document.querySelector('.device');
    if (!host) {
      if (typeof showToast === 'function') {
        showToast('One quick thing — add your gender so Personal matching works well.');
      }
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'profileGenderPrompt';
    banner.className = 'profile-gender-prompt';
    banner.innerHTML = `
      <div class="profile-gender-prompt-copy">
        <strong>Welcome to Personal</strong>
        <span>Gender helps people find the right connections. Add it when you’re ready — no rush.</span>
      </div>
      <div class="profile-gender-prompt-chips">
        ${['Male', 'Female', 'Non-binary', 'Prefer not to say']
          .map((g) => `<button type="button" data-gender="${g}">${g}</button>`)
          .join('')}
      </div>
      <button type="button" class="profile-gender-prompt-later" data-later>Later</button>`;
    host.insertBefore(banner, host.firstChild);

    banner.querySelectorAll('[data-gender]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gender = btn.dataset.gender;
        if (typeof digitalProfile !== 'undefined') digitalProfile.gender = gender;
        if (typeof userProfile !== 'undefined' && userProfile) {
          userProfile.gender = gender;
          userProfile.profile = userProfile.profile || {};
          userProfile.profile.gender = gender;
        }
        try {
          if (typeof digitalProfile !== 'undefined') {
            localStorage.setItem('chaupaal_digital_profile', JSON.stringify(digitalProfile));
          }
        } catch (e) {}
        if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
          db.collection('users')
            .doc(currentUser.uid)
            .update({ gender, 'profile.gender': gender })
            .catch(() => {});
        }
        if (typeof onProfileFieldSaved === 'function') onProfileFieldSaved('gender', '', gender);
        banner.remove();
        if (typeof showToast === 'function') showToast('Got it — thanks');
      });
    });
    banner.querySelector('[data-later]')?.addEventListener('click', () => banner.remove());
  }

  function wireProfileTypeToggle(root) {
    const block = root?.querySelector?.('#profileTypeBlock') || document.getElementById('profileTypeBlock');
    if (!block || block.dataset.wired) return;
    block.dataset.wired = '1';
    block.querySelectorAll('[data-profile-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prev = getProfileType();
        const next = saveProfileType(btn.dataset.profileType);
        block.querySelectorAll('[data-profile-type]').forEach((b) => {
          const on = b.dataset.profileType === next;
          b.classList.toggle('active', on);
          b.style.borderColor = on ? 'var(--red)' : 'var(--line)';
          b.style.background = on ? 'rgba(230,57,70,0.08)' : 'var(--white)';
          b.style.color = on ? 'var(--red)' : 'var(--ink)';
        });
        if (typeof showToast === 'function') {
          showToast(next === 'professional' ? 'Switched to Professional account' : 'Switched to Personal account');
        }
        if (prev !== 'personal' && next === 'personal') {
          promptPersonalGenderIfNeeded();
        }
      });
    });
  }

  window.getProfileType = getProfileType;
  window.saveProfileType = saveProfileType;
  window.hydrateProfileTypeFromUserDoc = hydrateProfileTypeFromUserDoc;
  window.renderProfileTypeToggleHtml = renderProfileTypeToggleHtml;
  window.wireProfileTypeToggle = wireProfileTypeToggle;
  window.promptPersonalGenderIfNeeded = promptPersonalGenderIfNeeded;
})();
