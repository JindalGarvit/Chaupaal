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

  function saveProfileType(next, opts) {
    const type = normalizeProfileType(next);
    const fromSignup = !!(opts && opts.fromSignup);
    // Type is chosen at signup and is not a same-login flip afterward.
    if (!fromSignup && typeof currentUser !== 'undefined' && currentUser) {
      const existing =
        (typeof userProfile !== 'undefined' &&
          userProfile &&
          normalizeProfileType(userProfile.profileType || userProfile.profile?.profileType)) ||
        (typeof digitalProfile !== 'undefined' &&
          digitalProfile?.profileType &&
          normalizeProfileType(digitalProfile.profileType)) ||
        null;
      if (existing && existing !== type) {
        console.warn('[profile-type] account type is fixed at signup — use Switch / add account');
        return existing;
      }
      if (existing) {
        // Idempotent same-type write OK for hydrate paths; skip Firestore churn
        if (typeof digitalProfile !== 'undefined') digitalProfile.profileType = existing;
        return existing;
      }
    }
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
    const label = type === 'professional' ? t('common.professional') : t('common.personal');
    return `
      <div class="profile-type-block" id="profileTypeBlock" style="margin:0 0 16px;padding:14px;border:1.5px solid var(--line);border-radius:14px;background:var(--cream);">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:4px;">${tHtml('common.account_type')}</div>
        <div style="font-size:12px;color:var(--ink);font-weight:600;margin-bottom:6px;">${label}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.4;">
          ${tHtml('profile.personal_and_professional_are_separate_acc')}
        </div>
        <button type="button" class="btn btn--block" data-open-account-switcher style="background:var(--white);border:1.5px solid var(--line);">${tHtml('profile.switch_add_account')}</button>
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
        showToast(t('profile.one_quick_thing_add_your_gender'));
      }
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'profileGenderPrompt';
    banner.className = 'profile-gender-prompt';
    banner.innerHTML = `
      <div class="profile-gender-prompt-copy">
        <strong>${tHtml('profile.welcome_to_personal')}</strong>
        <span>${tHtml('profile.gender_helps_people_find_the_right')}</span>
      </div>
      <div class="profile-gender-prompt-chips">
        ${/* i18n-values: gender */ ['Male', 'Female', 'Non-binary', 'Prefer not to say']
          .map((g) => `<button type="button" data-gender="${g}">${optionLabelHtml('gender', g)}</button>`)
          .join('')}
      </div>
      <button type="button" class="profile-gender-prompt-later" data-later>${tHtml('profile.later')}</button>`;
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
        if (typeof showToast === 'function') showToast(t('profile.got_it_thanks'));
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
