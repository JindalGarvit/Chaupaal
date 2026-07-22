/**
 * Own-profile preview: "Preview" (visitor view) vs "Edit my profile".
 * Default when opening own profile is Preview.
 */
(function () {
  let profilePreviewMode = true; // Preview by default for own profile

  function isProfilePreviewMode() {
    return !!profilePreviewMode;
  }

  function setProfilePreviewMode(on) {
    profilePreviewMode = !!on;
  }

  /**
   * Build the field set a stranger/match would see.
   * Respects profileVisibility + showAge / showLocation / showRelationship / showIncome / showReligion.
   */
  function getPublicVisibleProfile(dp, userMeta) {
    const p = dp || {};
    const meta = userMeta || {};
    const visibility = String(p.profileVisibility || 'public').toLowerCase();
    const isLocked = visibility === 'private' || visibility === 'friends only';

    const base = {
      displayName: p.displayName || meta.name || 'Member',
      username: meta.username || p.username || 'username',
      photoURL: meta.photoURL || null,
      bio: p.bio || '',
      locked: isLocked,
      visibilityLabel: isLocked
        ? visibility === 'private'
          ? 'Private profile'
          : 'Friends only'
        : 'Public',
      profileType: p.profileType || meta.profileType || 'personal',
    };

    if (isLocked) {
      return { ...base, fields: [] };
    }

    const fields = [];
    const push = (label, value) => {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
      fields.push({ label, value: Array.isArray(value) ? value.join(', ') : String(value) });
    };

    if (p.showLocation !== false) {
      push('City', p.currentCity);
      push('Hometown', p.hometown);
    }
    push('Occupation', p.occupation);
    push('Company', p.company);
    if (p.showAge !== false && p.dateOfBirth) push('Date of birth', p.dateOfBirth);
    else if (p.showAge !== false && p.age) push('Age', p.age);
    push('Pronouns', p.pronouns);
    if (p.languages?.length) push('Languages', p.languages);
    if (p.showRelationship !== false) {
      push('Relationship', p.relationshipStatus);
      push('Looking for', p.lookingFor);
    }
    if (p.showReligion !== false) push('Religion', p.religion);
    if (p.showIncome === true) push('Income', p.annualIncome);
    push('Hobbies', p.hobbies);
    push('Sports', p.sports);
    push('Instagram', p.instagram);
    push('Website', p.website);

    const ice = Array.isArray(p.icebreakers) ? p.icebreakers : [];
    ice.slice(0, 3).forEach((a) => {
      const prompt =
        typeof getIcebreakerPromptById === 'function' ? getIcebreakerPromptById(a.promptId) : null;
      if (a?.answer) {
        push(prompt ? `Icebreaker` : 'Conversation starter', a.answer);
      }
    });

    return { ...base, fields };
  }

  function renderPreviewToggleHtml() {
    const on = profilePreviewMode;
    return `
      <div id="profilePreviewToggle" class="profile-mode-toggle" role="tablist" aria-label="Profile mode">
        <button type="button" data-preview="1" role="tab" aria-selected="${on ? 'true' : 'false'}" class="${on ? 'is-active' : ''}">Preview</button>
        <button type="button" data-preview="0" role="tab" aria-selected="${!on ? 'true' : 'false'}" class="${!on ? 'is-active' : ''}">Edit my profile</button>
      </div>`;
  }

  function renderOwnPreviewChromeHtml(dp, userMeta) {
    const view = getPublicVisibleProfile(dp, userMeta);
    const esc =
      typeof escapeHtmlText === 'function'
        ? escapeHtmlText
        : (s) =>
            String(s || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/"/g, '&quot;');
    const nameHtml =
      typeof formatDisplayNameHtml === 'function'
        ? formatDisplayNameHtml(view.displayName, view.profileType)
        : esc(view.displayName);
    const bioHtml =
      view.bio && !view.locked
        ? typeof linkifyText === 'function'
          ? linkifyText(view.bio)
          : esc(view.bio)
        : '';
    return `
      ${renderPreviewToggleHtml()}
      <div class="own-profile-preview-toolbar">
        <button type="button" class="icon-btn profile-agg-notif" data-open-notif="all" aria-label="All notifications" title="Notifications" style="position:relative;">
          🔔<span class="notif-dot hidden" data-notif-dot="all"></span>
        </button>
        <button type="button" class="btn" data-open-archive-from-preview>Archive</button>
      </div>
      <div class="public-profile-hero own-preview-hero">
        <div class="public-profile-avatar" data-own-preview-avatar>
          ${view.photoURL ? `<img src="${esc(view.photoURL)}" alt="">` : '👤'}
        </div>
        <div class="public-profile-name" data-pro-badge-self data-pro-badge-name="${esc(view.displayName)}">${nameHtml}</div>
        <div class="public-profile-uname">@${esc(view.username)}</div>
        <div class="own-preview-chip">${esc(view.visibilityLabel)} · how others see you</div>
        ${bioHtml ? `<p class="public-profile-bio">${bioHtml}</p>` : ''}
      </div>
      <div class="own-preview-sections" data-own-preview-sections></div>
      <p class="own-preview-footnote">No edit controls in Preview — switch to Edit my profile to rearrange sections, add custom blocks, or archive.</p>
    `;
  }

  function renderStrangerPreviewHtml(dp, userMeta) {
    return renderOwnPreviewChromeHtml(dp, userMeta);
  }

  function wirePreviewToggle(root, onSwitch) {
    const bar = root?.querySelector?.('#profilePreviewToggle') || document.getElementById('profilePreviewToggle');
    if (!bar) return;
    bar.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.preview === '1';
        if (next === profilePreviewMode) return;
        setProfilePreviewMode(next);
        if (typeof onSwitch === 'function') onSwitch(next);
      });
    });
    root?.querySelector?.('[data-open-archive-from-preview]')?.addEventListener('click', () => {
      if (typeof openArchiveHub === 'function') openArchiveHub('posts');
      else if (typeof openArchive === 'function') openArchive();
    });
    if (typeof wireTabNotificationButtons === 'function') wireTabNotificationButtons();
  }

  window.isProfilePreviewMode = isProfilePreviewMode;
  window.setProfilePreviewMode = setProfilePreviewMode;
  window.getPublicVisibleProfile = getPublicVisibleProfile;
  window.renderPreviewToggleHtml = renderPreviewToggleHtml;
  window.renderStrangerPreviewHtml = renderStrangerPreviewHtml;
  window.renderOwnPreviewChromeHtml = renderOwnPreviewChromeHtml;
  window.wirePreviewToggle = wirePreviewToggle;
})();
