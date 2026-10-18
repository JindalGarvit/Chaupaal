/**
 * Own-profile preview: "Preview" (visitor view) vs "Edit my profile".
 * Default when opening own profile is Preview.
 * Audience toggle: as stranger / as friend — same projection path as public sheet.
 */
(function () {
  let profilePreviewMode = true; // Preview by default for own profile
  /** @type {'stranger'|'friend'} */
  let profilePreviewAudience = 'stranger';

  function isProfilePreviewMode() {
    return !!profilePreviewMode;
  }

  function setProfilePreviewMode(on) {
    profilePreviewMode = !!on;
  }

  function getProfilePreviewAudience() {
    return profilePreviewAudience === 'friend' ? 'friend' : 'stranger';
  }

  function setProfilePreviewAudience(audience) {
    profilePreviewAudience = audience === 'friend' ? 'friend' : 'stranger';
  }

  /**
   * Build the field set a stranger/match would see.
   * Respects profileVisibility + showAge / showLocation / showRelationship / showIncome / showReligion.
   * Friends only unlocks for actual friends (same isFriend as Digital friend_projection).
   * @param {object} dp
   * @param {object} userMeta
   * @param {{ isFriend?: boolean, viewerIsOwner?: boolean }} [opts]
   */
  function getPublicVisibleProfile(dp, userMeta, opts) {
    const p = dp || {};
    const meta = userMeta || {};
    const o = opts || {};
    const visibility = String(p.profileVisibility || meta.profileVisibility || 'public').toLowerCase();
    const isPrivate = visibility === 'private';
    const isFriendsOnly = visibility === 'friends only' || visibility === 'friends' || visibility === 'friends-only';
    // Locked for strangers; friends unlock Friends only. Private stays locked for everyone else.
    const isLocked = isPrivate || (isFriendsOnly && !o.isFriend);

    const base = {
      displayName: p.displayName || meta.name || t('common.member'),
      username: meta.username || p.username || 'username',
      photoURL: meta.photoURL || null,
      bio: isLocked ? '' : p.bio || '',
      locked: isLocked,
      visibilityLabel: isPrivate
        ? t('common.private_profile')
        : isFriendsOnly
          ? t('profile.friends_only')
          : t('profile.opt.profileVisibility.public'),
      profileType: p.profileType || meta.profileType || 'personal',
      identityLine: isLocked
        ? ''
        : [p.currentCity || p.city, p.occupation || p.headline].filter(Boolean).join(' · '),
    };

    if (isLocked) {
      return { ...base, fields: [] };
    }

    const fields = [];
    const push = (label, value, group) => {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
      const show = (v) => (group ? optionLabel(group, v) : String(v));
      fields.push({ label, value: Array.isArray(value) ? value.map(show).join(', ') : show(value) });
    };

    if (p.showLocation !== false) {
      push(t('profile.field_city'), p.currentCity || p.city);
      push(t('profile.field_hometown'), p.hometown);
    }
    push(t('profile.field_occupation'), p.occupation);
    push(t('profile.field_company'), p.company);
    if (p.showAge !== false && p.dateOfBirth) push(t('common.date_of_birth'), p.dateOfBirth);
    else if (p.showAge !== false && p.age) push(t('profile.field_age'), p.age);
    push(t('profile.field_pronouns'), p.pronouns, 'pronouns');
    if (p.languages?.length) push(t('profile.field_languages'), p.languages, 'languages');
    if (p.showRelationship !== false) {
      push(t('profile.field_relationship'), p.relationshipStatus, 'relationshipStatus');
      push(t('profile.looking_for'), p.lookingFor, 'intent');
    }
    if (p.showReligion !== false) push(t('profile.field_religion'), p.religion, 'religion');
    if (p.showIncome === true) push(t('profile.field_income'), p.annualIncome, 'annualIncome');
    push(t('profile.field_hobbies'), p.hobbies, 'hobbies');
    push(t('profile.field_sports'), p.sports, 'sports');
    push(t('profile.field_instagram'), p.instagram);
    push(t('profile.field_website'), p.website);

    return { ...base, fields };
  }

  function renderPreviewToggleHtml() {
    const on = profilePreviewMode;
    return `
      <div id="profilePreviewToggle" class="profile-mode-toggle" role="tablist" aria-label="${tHtml('profile.profile_mode')}">
        <button type="button" data-preview="1" role="tab" aria-selected="${on ? 'true' : 'false'}" class="${on ? 'is-active' : ''}">${tHtml('profile.view_as_others')}</button>
        <button type="button" data-preview="0" role="tab" aria-selected="${!on ? 'true' : 'false'}" class="${!on ? 'is-active' : ''}">${tHtml('profile.edit_profile')}</button>
      </div>`;
  }

  function renderAudienceToggleHtml() {
    const aud = getProfilePreviewAudience();
    return `
      <div class="profile-audience-toggle" role="tablist" aria-label="${tHtml('profile.preview_audience')}">
        <button type="button" data-preview-audience="stranger" role="tab" aria-selected="${aud === 'stranger' ? 'true' : 'false'}" class="${aud === 'stranger' ? 'is-active' : ''}">${tHtml('profile.as_stranger')}</button>
        <button type="button" data-preview-audience="friend" role="tab" aria-selected="${aud === 'friend' ? 'true' : 'false'}" class="${aud === 'friend' ? 'is-active' : ''}">${tHtml('profile.as_friend')}</button>
      </div>`;
  }

  function renderOwnPreviewChromeHtml(dp, userMeta, opts) {
    const isFriend = !!(opts && opts.isFriend);
    const view = getPublicVisibleProfile(dp, userMeta, { isFriend });
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
    const bioRaw = String(view.bio || '').trim();
    const bioSnippet = bioRaw.length > 140 ? bioRaw.slice(0, 137) + '…' : bioRaw;
    const bioHtml =
      bioSnippet && !view.locked
        ? typeof linkifyText === 'function'
          ? linkifyText(bioSnippet)
          : esc(bioSnippet)
        : '';
    const identity = view.identityLine ? `<div class="public-profile-identity">${esc(view.identityLine)}</div>` : '';
    const audienceNote =
      getProfilePreviewAudience() === 'friend'
        ? t('profile.friend_view_friends_only_blocks_unlock')
        : t('profile.stranger_view_exactly_what_a_non');
    return `
      ${renderPreviewToggleHtml()}
      ${renderAudienceToggleHtml()}
      <div class="public-profile-hero own-preview-hero">
        <div class="public-profile-avatar" data-own-preview-avatar>
          ${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml({...view,uid:typeof currentUser!=='undefined'?currentUser?.uid:'',profile:dp,avatarDisplay:(userMeta||{}).avatarDisplay},{decorative:false,alt:view.displayName}):(view.photoURL?`<img src="${esc(view.photoURL)}" alt="">`:'👤')}
        </div>
        <div class="public-profile-name" data-pro-badge-self data-pro-badge-name="${esc(view.displayName)}">${nameHtml}</div>
        <div class="public-profile-uname">@${esc(view.username)}</div>
        ${identity}
        ${bioHtml ? `<p class="public-profile-bio">${bioHtml}</p>` : ''}
        <div class="own-preview-chip">${esc(view.visibilityLabel)} · ${esc(audienceNote)}</div>
      </div>
      <div class="dp-rel-strip">
        <div data-profile-relationship-counts class="relationship-counts-loading">${tHtml('profile.loading_relationships')}</div>
      </div>
      <div class="own-preview-edit-cta">
        <button type="button" class="btn btn--primary btn--block" data-preview="0">${tHtml('profile.edit_profile')}</button>
      </div>
      <div class="own-preview-sections" data-own-preview-sections></div>
      <p class="own-preview-footnote">${tHtml('profile.same_projection_as_a_visitor_digital')}</p>
    `;
  }

  function renderStrangerPreviewHtml(dp, userMeta) {
    return renderOwnPreviewChromeHtml(dp, userMeta, { isFriend: false });
  }

  function wirePreviewToggle(root, onSwitch) {
    const scope = root || document;
    const buttons = scope.querySelectorAll('[data-preview]');
    buttons.forEach((btn) => {
      if (btn.dataset.previewWired === '1') return;
      btn.dataset.previewWired = '1';
      btn.addEventListener('click', () => {
        const next = btn.dataset.preview === '1';
        if (next === profilePreviewMode) return;
        setProfilePreviewMode(next);
        if (typeof onSwitch === 'function') onSwitch(next);
      });
    });
    scope.querySelectorAll('[data-preview-audience]').forEach((btn) => {
      if (btn.dataset.audienceWired === '1') return;
      btn.dataset.audienceWired = '1';
      btn.addEventListener('click', () => {
        const next = btn.dataset.previewAudience === 'friend' ? 'friend' : 'stranger';
        if (next === profilePreviewAudience) return;
        setProfilePreviewAudience(next);
        if (typeof onSwitch === 'function') onSwitch(profilePreviewMode);
      });
    });
    const ownAvatar = root?.querySelector?.('[data-own-preview-avatar]');
    if (ownAvatar && ownAvatar.dataset.lightboxWired !== '1') {
      ownAvatar.dataset.lightboxWired = '1';
      if (typeof markIdentityAvatar === 'function') markIdentityAvatar(ownAvatar);
      ownAvatar.addEventListener('click', (e) => {
        if (ownAvatar.dataset.suppressClick === '1') {
          ownAvatar.dataset.suppressClick = '0';
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : {};
        const up = typeof userProfile !== 'undefined' ? userProfile : {};
        if (typeof openAvatarLightbox === 'function') {
          openAvatarLightbox({
            photoURL: dp.photoURL || up.photoURL || up.photoThumb || '',
            name: dp.displayName || up.name || up.displayName || 'You',
            uid: typeof currentUser !== 'undefined' ? currentUser?.uid : '',
            username: dp.username || up.username || '',
            avatar: up.avatar,
          });
        }
      });
    }
  }

  /**
   * Optional 3-button peek (View / Message / Cancel).
   * Do not use for Duniya/Peepal feed identity taps — those go straight to profile or DM.
   */
  function openProfilePeek(profile, opts = {}) {
    if (!profile) return;
    if (profile.isChaupaal || profile.type === 'chaupaal' || profile.uid === 'chaupaal_ai') {
      if (typeof openChaupaalAiPeek === 'function') return openChaupaalAiPeek();
      if (typeof openChaupaalAiProfile === 'function') return openChaupaalAiProfile();
    }
    const uid = opts.uid || profile.uid || profile.id;
    const username = opts.username || profile.username;
    const isSelf =
      typeof isSelfUid === 'function' ? isSelfUid(uid) : uid && uid === currentUser?.uid;
    // Self from third-person surfaces → full preview (not peek)
    if (isSelf) {
      if (typeof openUserProfile === 'function') {
        openUserProfile(profile, {
          uid,
          username,
          context: opts.context || 'third_person',
          initialMode: 'preview',
        });
        return;
      }
    }
    const name =
      (typeof resolvePersonDisplayName === 'function'
        ? resolvePersonDisplayName(profile)
        : null) ||
      profile.name ||
      profile.displayName ||
      username ||
      t('common.member');
    const photo = profile.photoURL || profile.photo || null;
    const pType = profile.profileType || 'personal';

    document.getElementById('profilePeekSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'profilePeekSheet';
    sheet.className = 'archive-overlay profile-peek-sheet';
    sheet.setAttribute('data-nav-managed', '1');
    const nameHtml =
      typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(name, pType) : String(name).replace(/</g, '&lt;');
    sheet.innerHTML = `
      <div class="profile-peek-inner">
        <div class="profile-peek-avatar squircle-avatar">${typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml({...profile,uid,photoURL:photo||profile.photoURL},{decorative:false,alt:name}):(photo?`<img src="${String(photo).replace(/"/g,'')}" alt="">`:'👤')}</div>
        <div class="profile-peek-name">${nameHtml}</div>
        <div class="profile-peek-sub">${username ? '@' + String(username).replace(/</g, '&lt;') : ''}</div>
        <div class="profile-peek-actions">
          <button type="button" class="btn btn--primary" data-peek-full>${typeof t === 'function' ? t('peek_view_profile', 'View profile') : tHtml('profile.cai_view_profile')}</button>
          ${isSelf ? '' : `<button type="button" class="btn" data-peek-message>${typeof t === 'function' ? t('peek_message', 'Message') : tHtml('profile.avatar_menu_message')}</button>`}
          <button type="button" class="btn" data-peek-dismiss>${typeof t === 'function' ? t('cancel', 'Cancel') : tHtml('common.cancel')}</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      if (sheet.isConnected) sheet.remove();
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { remove: false });
    else if (typeof pushNavLayer === 'function') {
      sheet.dataset.navManaged = '1';
      pushNavLayer(sheet, close);
    }
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
    sheet.querySelector('[data-peek-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-peek-full]')?.addEventListener('click', () => {
      close();
      if (typeof openUserProfile === 'function') {
        openUserProfile(profile, {
          uid,
          username,
          context: opts.context || 'third_person',
        });
      } else if (typeof openPublicProfile === 'function') {
        openPublicProfile(profile, { uid, username });
      } else if (username && typeof openProfileByUsername === 'function') {
        openProfileByUsername(username);
      }
    });
    sheet.querySelector('[data-peek-message]')?.addEventListener('click', () => {
      close();
      if (typeof openProfileMessage === 'function') openProfileMessage({ ...profile, uid, username, name });
      else if (typeof openDmWithSharedHello === 'function' && uid) openDmWithSharedHello({ uid, name, username });
      else if (typeof startChatWithUser === 'function') startChatWithUser(profile);
      else if (typeof showToast === 'function') showToast(t('profile.open_baithak_to_message'));
    });
  }

  window.isProfilePreviewMode = isProfilePreviewMode;
  window.setProfilePreviewMode = setProfilePreviewMode;
  window.getProfilePreviewAudience = getProfilePreviewAudience;
  window.setProfilePreviewAudience = setProfilePreviewAudience;
  window.getPublicVisibleProfile = getPublicVisibleProfile;
  window.renderPreviewToggleHtml = renderPreviewToggleHtml;
  window.renderStrangerPreviewHtml = renderStrangerPreviewHtml;
  window.renderOwnPreviewChromeHtml = renderOwnPreviewChromeHtml;
  window.wirePreviewToggle = wirePreviewToggle;
  window.openProfilePeek = openProfilePeek;
})();
