/**
 * Profile type foundation — intentionally minimal.
 *
 * Schema: users/{uid}.profileType + users/{uid}.profile.profileType
 * Values: 'personal' | 'professional'
 *
 * "Professional" = businesses, media houses, content creators, or public figures
 * operating in a professional capacity — NOT a personal career/networking profile mode.
 *
 * Personal ↔ Professional is NOT a same-login toggle. Want both? Add a separate
 * account via the device switcher (Instagram-style). Type is chosen at signup.
 *
 * EXTENSIBILITY POINT (do not remove): future pro-account features should branch on
 * getProfileType() / digitalProfile.profileType — e.g. business info fields, verified
 * badges, follower-style dynamics (vs mutual friends), and creator tools — without a
 * schema migration.
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
    document.dispatchEvent(new CustomEvent('chaupaal:profile-type-changed', { detail: { type } }));
    if (typeof refreshProfessionalBadges === 'function') refreshProfessionalBadges();
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

  /** Read-only account type + CTA to add a separate account (no Personal↔Pro flip). */
  function renderProfileTypeToggleHtml() {
    const type = getProfileType();
    const label = type === 'professional' ? 'Professional' : 'Personal';
    return `
      <div class="profile-type-block" id="profileTypeBlock" style="margin:0 0 16px;padding:14px;border:1.5px solid var(--line);border-radius:14px;background:var(--cream);">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:4px;">Account type</div>
        <div style="font-size:12px;color:var(--ink);font-weight:600;margin-bottom:6px;">${label}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.4;">
          Personal and Professional are separate accounts — not a toggle. Add another account from the switcher to use both.
        </div>
        <button type="button" class="btn btn--block" data-open-account-switcher style="background:var(--white);border:1.5px solid var(--line);">Switch / add account</button>
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
    block.querySelector('[data-open-account-switcher]')?.addEventListener('click', () => {
      if (typeof openAccountSwitcher === 'function') openAccountSwitcher();
      else if (typeof openProfileSwitcher === 'function') openProfileSwitcher();
    });
  }

  window.getProfileType = getProfileType;
  window.saveProfileType = saveProfileType;
  window.hydrateProfileTypeFromUserDoc = hydrateProfileTypeFromUserDoc;
  window.renderProfileTypeToggleHtml = renderProfileTypeToggleHtml;
  window.wireProfileTypeToggle = wireProfileTypeToggle;
  window.promptPersonalGenderIfNeeded = promptPersonalGenderIfNeeded;
})();
