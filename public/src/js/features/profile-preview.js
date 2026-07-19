/**
 * Own-profile preview: "My view" (editable) vs "Preview as others see it" (read-only).
 * Applies the same privacy/visibility rules a stranger would get.
 */
(function () {
  let profilePreviewMode = false; // false = my view, true = stranger preview

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

    // Icebreakers visible to matches (answers only, like discovery)
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
      <div id="profilePreviewToggle" style="display:flex;gap:6px;padding:4px;background:var(--cream);border-radius:12px;margin-bottom:12px;border:1px solid var(--line);">
        <button type="button" data-preview="0" style="flex:1;padding:8px 10px;border:none;border-radius:10px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;background:${!on ? 'var(--white)' : 'transparent'};color:${!on ? 'var(--red)' : 'var(--muted)'};box-shadow:${!on ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'};">My view</button>
        <button type="button" data-preview="1" style="flex:1;padding:8px 10px;border:none;border-radius:10px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;background:${on ? 'var(--white)' : 'transparent'};color:${on ? 'var(--red)' : 'var(--muted)'};box-shadow:${on ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'};">Preview as others see it</button>
      </div>`;
  }

  function renderStrangerPreviewHtml(dp, userMeta) {
    const view = getPublicVisibleProfile(dp, userMeta);
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
    return `
      ${renderPreviewToggleHtml()}
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="width:88px;height:88px;border-radius:50%;margin:0 auto 12px;background:var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:40px;border:3px solid var(--line);">
          ${view.photoURL ? `<img src="${esc(view.photoURL)}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
        </div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:20px;">${esc(view.displayName)}</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:6px;">@${esc(view.username)}</div>
        <div style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);background:var(--cream);border:1px solid var(--line);border-radius:999px;padding:4px 10px;">${esc(view.visibilityLabel)} · read-only preview</div>
        ${view.bio && !view.locked ? `<div style="font-size:14px;margin-top:14px;line-height:1.5;text-align:left;padding:0 4px;">${esc(view.bio)}</div>` : ''}
      </div>
      ${
        view.locked
          ? `<div style="padding:20px 14px;text-align:center;color:var(--muted);font-size:13px;line-height:1.5;border:1px dashed var(--line);border-radius:14px;">
              This is what a stranger sees — profile details are hidden (${esc(view.visibilityLabel).toLowerCase()}).
            </div>`
          : view.fields.length
            ? `<div style="display:flex;flex-direction:column;gap:10px;">
                ${view.fields
                  .map(
                    (f) => `
                  <div style="padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--white);">
                    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:4px;">${esc(f.label)}</div>
                    <div style="font-size:14px;line-height:1.4;">${esc(f.value)}</div>
                  </div>`
                  )
                  .join('')}
              </div>`
            : `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">Not much is public yet — fill your profile and check privacy toggles.</div>`
      }
      <p style="font-size:11px;color:var(--muted);margin-top:16px;text-align:center;line-height:1.4;">No edit controls in preview — this matches a stranger’s view.</p>
    `;
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
  }

  window.isProfilePreviewMode = isProfilePreviewMode;
  window.setProfilePreviewMode = setProfilePreviewMode;
  window.getPublicVisibleProfile = getPublicVisibleProfile;
  window.renderPreviewToggleHtml = renderPreviewToggleHtml;
  window.renderStrangerPreviewHtml = renderStrangerPreviewHtml;
  window.wirePreviewToggle = wirePreviewToggle;
})();
