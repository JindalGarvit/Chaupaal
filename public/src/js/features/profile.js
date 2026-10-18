// ===================== PROFILE MODAL — FULL DIGITAL PROFILE =====================
function ownProfileForAvatar(p, dp){
  return {
    uid:typeof currentUser!=='undefined'?currentUser?.uid:'',
    ...(p||{}),
    name:(dp&&dp.displayName)||p?.name,
    gender:(dp&&dp.gender)||p?.gender,
    interests:(dp&&dp.interests)||p?.interests,
    hobbies:(dp&&dp.hobbies)||p?.hobbies,
    occupation:(dp&&dp.occupation)||p?.occupation,
    city:(dp&&dp.currentCity)||p?.city,
    profileType:(dp&&dp.profileType)||p?.profileType,
    industry:p?.industry||(dp&&dp.industry),
    purpose:p?.purpose||(dp&&dp.purpose),
    avatarDisplay:p?.avatarDisplay,
    profile:dp||{},
  };
}
window.ownProfileForAvatar = ownProfileForAvatar;

function renderProfileModal(){
  const el=document.getElementById('profileContent');
  if(!currentUser){
    el.innerHTML=`<p style="color:var(--muted);font-size:14px;margin-bottom:16px;">${tHtml('profile.sign_in_to_see_your_profile')}</p><button class="btn btn--primary btn--block btn--lg auth-btn" onclick="document.getElementById('profileModal').classList.add('hidden');showAuth()">${tHtml('profile.sign_in_sign_up')}</button>`;
    return;
  }
  const p=userProfile||{};
  const dp=digitalProfile;

  // Preview as others see it — visitor chrome, no edit affordances
  if(typeof isProfilePreviewMode==='function' && isProfilePreviewMode()){
    const previewAsFriend =
      typeof getProfilePreviewAudience === 'function' && getProfilePreviewAudience() === 'friend';
    el.innerHTML = typeof renderOwnPreviewChromeHtml==='function'
      ? renderOwnPreviewChromeHtml(dp, p, { isFriend: previewAsFriend })
      : (typeof renderStrangerPreviewHtml==='function'
        ? renderStrangerPreviewHtml(dp, p)
        : '<p style="color:var(--muted);">' + tHtml('profile.preview_unavailable') + '</p>');
    setTimeout(()=>{
      if(typeof wirePreviewToggle==='function'){
        wirePreviewToggle(el, ()=>renderProfileModal());
      }
      if(typeof mountProfileShell==='function'){
        // Same projection as openPublicProfile: stranger or friend audience.
        const previewView =
          typeof getPublicVisibleProfile === 'function'
            ? getPublicVisibleProfile(dp, p, { isFriend: previewAsFriend })
            : null;
        let previewProfile = previewView?.locked
          ? {
              ...dp,
              bio: '',
              digitalLayout: { version: 1, blocks: [] },
              customSections: [],
              interests: [],
              hobbies: [],
              icebreakers: [],
              prompts: [],
              profileMedia: [],
            }
          : { ...dp };
        if (previewAsFriend && !previewView?.locked && typeof DigitalLayout?.friendsDigitalLayoutProjection === 'function') {
          try {
            const friendLayout = DigitalLayout.friendsDigitalLayoutProjection(dp);
            if (friendLayout?.blocks?.length) previewProfile = { ...previewProfile, digitalLayout: friendLayout };
          } catch (e) {}
        } else if (!previewAsFriend && !previewView?.locked && typeof DigitalLayout?.publicDigitalLayoutProjection === 'function') {
          try {
            const pubLayout = DigitalLayout.publicDigitalLayoutProjection(dp);
            if (pubLayout?.blocks?.length) previewProfile = { ...previewProfile, digitalLayout: pubLayout };
          } catch (e) {}
        }
        mountProfileShell(el.querySelector('[data-own-preview-sections]'), {
          uid: currentUser?.uid,
          editable: false,
          isOwner: false,
          isFriend: previewAsFriend,
          includeArchived: false,
          profile: previewProfile,
          view: previewView,
        });
      } else if(typeof mountOwnProfileSections==='function'){
        mountOwnProfileSections(el.querySelector('[data-own-preview-sections]'), {
          editable:false,
          isOwner:false,
          includeArchived:false,
        });
      }
      if(typeof mountOwnRelationshipPanel==='function') mountOwnRelationshipPanel(el);
    },0);
    return;
  }

  // Completeness (shared Phase 3 helper)
  const stats=typeof calcProfileCompletion==='function'?calcProfileCompletion(dp):{pct:0,missing:[]};
  const pct=stats.pct;
  const displayName=dp.displayName||p.name||t('profile.your_name');
  const nameHtml=typeof formatDisplayNameHtml==='function'
    ? formatDisplayNameHtml(displayName, typeof getProfileType==='function'?getProfileType():dp.profileType)
    : displayName;
  const avatarProfile=ownProfileForAvatar(p,dp);
  const avatarHtml=typeof renderUserAvatarHtml==='function'
    ? renderUserAvatarHtml(avatarProfile,{noteIntroForSelf:true,decorative:false,alt:displayName})
    :(p.photoURL?`<img src="${p.photoURL}" alt="">`:'🪑');
  const showAvatarToggle=typeof hasUserProfilePhoto==='function'&&hasUserProfilePhoto(avatarProfile);
  const avatarMode=typeof getAvatarDisplay==='function'?getAvatarDisplay(avatarProfile):'photo';
  const avatarToggleLabel=avatarMode==='gift'
    ?(typeof t==='function'&&t('avatar_use_photo')!=='avatar_use_photo'?t('avatar_use_photo'):t('profile.avatar_use_photo'))
    :(typeof t==='function'&&t('avatar_use_gift')!=='avatar_use_gift'?t('avatar_use_gift'):t('profile.avatar_use_gift'));

  el.innerHTML=`
    ${typeof renderPreviewToggleHtml==='function'?renderPreviewToggleHtml():''}
    ${p.needsEmailForPasswordLogin?`<div class="profile-password-login-note" style="margin:0 0 12px;padding:12px 14px;border-radius:12px;background:rgba(230,57,70,0.08);border:1.5px solid rgba(230,57,70,0.22);font-size:12px;line-height:1.45;color:var(--ink);">${tHtml('profile.add_an_email_to_enable_password')}</div>`:''}
    <div class="dp-hero dp-hero--premium">
      <div class="dp-hero-top">
        <div class="dp-hero-avatar-wrap">
          <div id="ownProfileStoryAvatar" class="dp-hero-avatar squircle-avatar">
            ${avatarHtml}
          </div>
          <label class="dp-hero-edit" title="${tHtml('profile.change_photo')}">
            ✎<input type="file" accept="image/*" id="profilePhotoInput" style="display:none;">
          </label>
          ${showAvatarToggle?`<button type="button" class="dp-avatar-mode-btn" id="toggleAvatarDisplayBtn">${avatarToggleLabel}</button>`:''}
        </div>
        <div class="dp-hero-actions" role="group" aria-label="${tHtml('profile.profile_tools')}">
          <button type="button" class="icon-btn dp-hero-action" id="profileArchiveBtn" aria-label="${tHtml('profile.archive_title')}" title="${tHtml('profile.archive_title')}">${typeof iconHtml==='function'?iconHtml('archive',{size:20}):''}</button>
          <button type="button" class="icon-btn dp-hero-action" id="profileSettingsGear" aria-label="${tHtml('common.settings')}" title="${tHtml('common.settings')}">${typeof iconHtml==='function'?iconHtml('settings',{size:20}):''}</button>
        </div>
      </div>
      <div class="dp-hero-copy">
        <div class="dp-hero-name" data-account-switch data-pro-badge-self data-pro-badge-name="${(displayName||'').replace(/"/g,'&quot;')}" style="cursor:pointer;" title="${tHtml('profile.switch_account')}">${nameHtml}</div>
        <div class="dp-hero-handle" data-account-switch style="cursor:pointer;" title="${tHtml('profile.switch_account')}">@${p.username||tHtml('profile.username')}</div>
        <div class="dp-hero-meta">${[dp.currentCity,dp.occupation].filter(Boolean).join(' · ')||tHtml('profile.add_your_city_job')}</div>
        ${pct < 95 ? `<div class="dp-hero-complete">
          <div class="dp-hero-complete-row">
            <span>${tHtml('profile.tab_digital')}</span>
            <span data-ui="profile-completion-pct">${pct}%</span>
          </div>
          <div class="dp-hero-complete-track">
            <div data-ui="profile-completion-bar" style="width:${pct}%"></div>
          </div>
          <div class="dp-hero-sections" role="list">
            ${['identity','social','relationship','career','trust'].map((id)=>{
              const sec=stats.sections?.[id]||{pct:0};
              const hide=id==='relationship' && (stats.hideRelationship || (typeof teenHideDatingIntents==='function' && teenHideDatingIntents()));
              const labels={identity:t('common.identity'),social:t('profile.social'),relationship:t('profile.relationship_section'),career:t('profile.career'),trust:t('profile.trust')};
              return `<button type="button" class="dp-hero-section${sec.complete?' is-complete':''}" data-complete-section="${id}" ${hide?'hidden':''} role="listitem">
                <span class="dp-hero-section-lab">${labels[id]}</span>
                <span class="dp-hero-section-track"><span data-section-bar style="width:${sec.pct||0}%"></span></span>
                <span data-section-pct>${sec.pct||0}%</span>
              </button>`;
            }).join('')}
          </div>
          <div data-ui="profile-completion-hint" class="dp-hero-complete-hint">${stats.missing?.length?tHtml('profile.completion_next', { items: typeof formatList === 'function' ? formatList(stats.missing.slice(0,2)) : stats.missing.slice(0,2).join(', ') }):tHtml('profile.looking_good_this_profile_feels_like')}</div>
        </div>` : ''}
      </div>
    </div>
    <div class="dp-rel-strip">
      <div data-profile-relationship-counts class="relationship-counts-loading">${tHtml('profile.loading_relationships')}</div>
      <div data-friend-requests></div>
    </div>
    <button type="button" class="chaupaal-id-card" data-open-chaupaal-card aria-label="${tHtml('common.chaupaal_card_title')}">
      <span class="chaupaal-id-card-mark" aria-hidden="true">🪑</span>
      <span class="chaupaal-id-card-copy">
        <strong data-i18n="chaupaal_card_title">${tHtml('common.chaupaal_card_title')}</strong>
        <small data-i18n="chaupaal_card_sub">${tHtml('profile.shareable_identity_hub_membership')}</small>
      </span>
      <span class="chaupaal-id-card-chev" aria-hidden="true">›</span>
    </button>
    <div class="own-profile-edit-toolbar dp-toolbar dp-hub-row">
      <button type="button" class="btn profile-notif-entry" data-open-notif="all" aria-label="${tHtml('profile.notifications')}">
        <span data-i18n="profile_notifications">${tHtml('profile.inbox')}</span>
        <span class="notif-dot hidden" data-notif-dot="all" aria-hidden="true"></span>
      </button>
      <button type="button" class="btn" data-dp-hub="interactions">${tHtml('profile.archive_tab_activity')}</button>
      <button type="button" class="btn" data-push-history>${tHtml('profile.notif_history')}</button>
      <button type="button" class="btn" data-dp-hub="journal">${tHtml('profile.archive_tab_journal')}</button>
      <button type="button" class="btn" data-dp-hub="stories">${tHtml('profile.highlights')}</button>
      <button type="button" class="btn" data-dp-more-hub>${tHtml('common.more')}</button>
      <button type="button" class="btn btn--primary" id="profileAddSectionBtn" title="${tHtml('profile.add_section')}">＋</button>
    </div>
    <div class="own-edit-sections" data-own-edit-sections></div>
    <p class="dp-reorder-hint">${tHtml('profile.highlights_sit_above_tabs_profile_duniya')}</p>
    <div class="dp-field-tabs" id="profileSectionTabs">
      ${(typeof ProfileTaxonomy?.isProfessional === 'function' && ProfileTaxonomy.isProfessional()
        ? /* i18n-values: section */ ['About', 'Career', 'Links', 'More']
        : /* i18n-values: section */ ['About', 'Looking for', 'Lifestyle', 'More']
      )
        .map((s, i) => `<button type="button" class="profile-section-tab${i === 0 ? ' active' : ''}" data-sec="${s}">${optionLabelHtml('section', s)}</button>`)
        .join('')}
    </div>
    <div id="profileSectionContent" class="dp-field-body"></div>
    <div class="dp-account-strip">
      <button type="button" class="btn btn--primary btn--block" data-dp-open-hub>${tHtml('profile.chaupaal_hub_trust_money_devices')}</button>
      <button type="button" class="btn btn--block" id="switchProfileBtn">${tHtml('profile.switch_add_account')}</button>
      <button type="button" class="logout-btn" id="logoutBtn">${tHtml('common.logout')}</button>
    </div>
  `;

  // Section rendering — Glance/Act first; Power under More. Personal vs Professional templates.
  const TX = typeof ProfileTaxonomy !== 'undefined' ? ProfileTaxonomy : {};
  const interestChips = TX.INTEREST_CHIPS || /* i18n-values: interest */ ['Travel', 'Food', 'Films', 'Music', 'Fitness', 'Books', 'Tech', 'Sports', 'Gaming'];
  const cityChips = TX.CITY_CHIPS || /* i18n-values: city */ ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'];
  const matchIntents = TX.MATCH_INTENTS || /* i18n-values: intent */ ['Friendship', 'Dating', 'Networking / Professional connections'];
  const proIntents = TX.PRO_INTENTS || matchIntents;
  const industries = TX.INDUSTRIES || /* i18n-values: industry */ ['Technology', 'Education', 'Media & Entertainment', 'Entrepreneur', 'Other'];
  const purposes = TX.PURPOSES || /* i18n-values: purpose */ ['Grow my network', 'Find collaborators', 'Share my work'];
  const skillChips = TX.SKILL_CHIPS || /* i18n-values: skill */ ['Leadership', 'Writing', 'Coding', 'Design', 'Marketing'];

  function privacyInline(key, label) {
    const def = (TX.SENSITIVE_DEFAULTS && TX.SENSITIVE_DEFAULTS[key]) || 'friends';
    const showKey =
      key === 'religion'
        ? 'showReligion'
        : key === 'annualIncome'
          ? 'showIncome'
          : key === 'relationshipStatus' || key === 'lookingFor'
            ? 'showRelationship'
            : null;
    const cur = showKey
      ? dp[showKey] === true
        ? 'public'
        : dp[showKey] === false
          ? 'private'
          : def
      : def;
    const matching =
      TX.FIELD_META && TX.FIELD_META[key]?.matching
        ? `<div style="font-size:11px;color:var(--muted);margin:4px 0 0;line-height:1.35;">${tHtml('profile.used_for_matching_when_visible')}</div>`
        : '';
    const audienceLabel = { public: t('profile.public'), friends: t('profile.friends'), private: t('profile.private') };
    if (!showKey) {
      return `<div style="font-size:11px;color:var(--muted);margin:-8px 0 12px;">${tHtml('profile.privacy_default_hint', { audience: audienceLabel[def] || def })}</div>${matching}`;
    }
    return `<div class="dp-privacy-inline" data-privacy-for="${key}" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:-6px 0 12px;">
      <span style="font-size:11px;color:var(--muted);">${tHtml('profile.who_sees_field', { field: label || t('profile.this') })}</span>
      ${['public', 'friends', 'private']
        .map((a) => {
          const active =
            (a === 'public' && dp[showKey] === true) ||
            (a === 'private' && dp[showKey] === false) ||
            (a === 'friends' && dp[showKey] !== true && dp[showKey] !== false && def === 'friends') ||
            (a === 'private' && dp[showKey] !== true && def === 'private' && dp[showKey] !== false);
          // friends mapped as show* = false for relationship? P0: showRelationship false hides from public.
          // public = show true; private/friends = show false (friends still get friend_projection when Friends only profile).
          return `<button type="button" class="dp-chip${active ? ' active' : ''}" data-privacy-key="${showKey}" data-privacy-audience="${a}" style="padding:4px 10px;font-size:11px;border-radius:999px;border:1.5px solid ${active ? 'var(--red)' : 'var(--line)'};background:${active ? 'rgba(230,57,70,0.08)' : 'var(--white)'};color:${active ? 'var(--red)' : 'var(--ink)'};cursor:pointer;">${audienceLabel[a]}</button>`;
        })
        .join('')}
    </div>${matching}`;
  }

  function payoffLine(key) {
    const p = TX.FIELD_META && TX.FIELD_META[key]?.payoff;
    return p
      ? `<div style="font-size:11px;color:var(--muted);margin:-4px 0 10px;line-height:1.35;">${p}</div>`
      : '';
  }

  const SECTIONS = {
    About: () => {
      const pro = typeof TX.isProfessional === 'function' && TX.isProfessional();
      return `
      ${typeof renderProfileTypeToggleHtml === 'function' ? renderProfileTypeToggleHtml() : ''}
      ${profileField(t('profile.name'), 'displayName', 'text', t('profile.your_full_name'))}
      ${profileField(t('profile.bio'), 'bio', 'textarea', t('profile.a_short_bio_about_yourself'))}
      ${payoffLine('bio')}
      ${profileField(t('common.gender'), 'gender', 'select', '', ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'])}
      ${profileField(t('profile.pronouns'), 'pronouns', 'select', '', ['', 'He/Him', 'She/Her', 'They/Them', 'Any'])}
      ${profileField(t('profile.date_of_birth'), 'dateOfBirth', 'date', '')}
      ${profileField(t('profile.current_city'), 'currentCity', 'chips-single', t('profile.city'), cityChips)}
      ${payoffLine('currentCity')}
      ${profileField(t('profile.languages_spoken'), 'languages', 'chips', t('profile.add_languages'), ['Hindi', 'English', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'])}
      ${profileField(t('profile.things_that_excite_me'), 'interests', 'chips', t('profile.add_interests'), interestChips)}
      ${payoffLine('interests')}
      ${profileField(t('profile.interests_in_your_words'), 'interestsFreeText', 'textarea', t('profile.optional_whatever_you_care_about_in'))}
      <div class="dp-ask-chaupaal" data-for="interestsFreeText" style="margin:-6px 0 14px;"></div>
      ${pro ? '' : typeof renderProfilePromptsBlock === 'function' ? renderProfilePromptsBlock() : ''}
      ${pro ? `${profileField(t('profile.occupation_role'), 'occupation', 'text', t('profile.what_do_you_do'))}${payoffLine('occupation')}` : ''}
    `;
    },
    'Looking for': () => {
      const teen = typeof teenHideDatingIntents === 'function' && teenHideDatingIntents();
      if (teen) {
        return `<p style="font-size:13px;color:var(--muted);line-height:1.45;padding:8px 0;">${tHtml('profile.dating_asks_stay_off_in_teen')}</p>`;
      }
      return `
      ${profileField(t('profile.relationship_status'), 'relationshipStatus', 'select', '', ['', 'Single', 'In a relationship', 'Married', 'Prefer not to say', 'It\'s complicated'])}
      ${privacyInline('relationshipStatus', t('profile.relationship'))}
      ${profileField(t('profile.looking_for'), 'lookingFor', 'chips-single', '', matchIntents)}
      ${privacyInline('lookingFor', t('profile.looking_for_2'))}
      ${payoffLine('lookingFor')}
    `;
    },
    Career: () => `
      ${profileField(t('profile.occupation_job_title'), 'occupation', 'text', t('profile.what_do_you_do'))}
      <div class="dp-ask-chaupaal" data-for="occupation" style="margin:-6px 0 14px;"></div>
      ${profileField(t('profile.company_organisation'), 'company', 'text', t('profile.where_do_you_work'))}
      ${profileField(t('common.industry'), 'industry', 'chips-single', '', industries)}
      ${payoffLine('industry')}
      ${profileField(t('common.purpose_on_chaupaal'), 'purpose', 'chips-single', '', purposes)}
      ${payoffLine('purpose')}
      ${profileField(t('profile.open_to'), 'lookingFor', 'chips-single', '', proIntents)}
      ${profileField(t('profile.skills'), 'skills', 'chips', t('profile.add_skills'), skillChips)}
      ${payoffLine('skills')}
      ${profileField(t('profile.work_mode'), 'workMode', 'select', '', ['', 'In-office', 'Remote', 'Hybrid', 'Freelance', 'Between jobs'])}
      ${profileField(t('profile.career_level'), 'careerLevel', 'select', '', ['', 'Student / Intern', 'Entry level (0-2 yrs)', 'Mid level (3-6 yrs)', 'Senior (7-10 yrs)', 'Lead / Manager', 'Director / VP', 'C-Suite / Founder'])}
      ${profileField(t('profile.annual_income_optional'), 'annualIncome', 'select', '', ['', 'Prefer not to say', 'Under ₹3L', '₹3L-6L', '₹6L-10L', '₹10L-20L', '₹20L-40L', 'Above ₹40L'])}
      ${privacyInline('annualIncome', t('profile.income'))}
    `,
    Links: () => `
      ${profileField(t('profile.linkedin'), 'linkedin', 'text', t('profile.profile_url_or_username'))}
      ${payoffLine('linkedin')}
      ${profileField(t('profile.website_portfolio'), 'website', 'text', 'https://')}
      ${payoffLine('website')}
      ${profileField(t('profile.instagram'), 'instagram', 'text', t('common.username'))}
      ${profileField(t('profile.youtube'), 'youtube', 'text', t('profile.channel_name'))}
    `,
    Lifestyle: () => `
      ${profileField(t('profile.diet'), 'diet', 'select', '', ['', 'Omnivore', 'Vegetarian', 'Eggetarian', 'Vegan', 'Jain', 'Other'])}
      ${profileField(t('profile.drinking'), 'drinking', 'select', '', ['', 'Never', 'Socially', 'Occasionally', 'Regularly', 'Prefer not to say'])}
      ${profileField(t('profile.smoking'), 'smoking', 'select', '', ['', 'Never', 'Occasionally', 'Regularly', 'Trying to quit', 'Prefer not to say'])}
      ${profileField(t('profile.fitness'), 'fitness', 'select', '', ['', 'Very active (daily workout)', 'Active (3-4x/week)', 'Moderately active', 'Occasionally active', 'Not into fitness'])}
      ${profileField(t('profile.core_values'), 'coreValues', 'chips', t('profile.add_values'), ['Family', 'Ambition', 'Freedom', 'Creativity', 'Loyalty', 'Honesty', 'Adventure', 'Growth', 'Humour', 'Empathy'])}
    `,
    More: () => {
      const pro = typeof TX.isProfessional === 'function' && TX.isProfessional();
      return `
      <div style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.4;">${tHtml('profile.power_layer_optional_details_nothing_here')}</div>
      ${profileField(t('profile.hometown'), 'hometown', 'text', t('profile.where_you_grew_up'))}
      ${profileField(t('profile.height'), 'height', 'select', '', ['', 'Under 5ft', '5ft', '5ft 2in', '5ft 4in', '5ft 6in', '5ft 8in', '5ft 10in', '6ft', '6ft+'])}
      ${profileField(t('profile.religion'), 'religion', 'select', '', ['', 'Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Atheist', 'Agnostic', 'Spiritual but not religious', 'Prefer not to say'])}
      ${privacyInline('religion', t('profile.religion_2'))}
      ${profileField(t('profile.politics'), 'politics', 'select', '', ['', 'Progressive', 'Liberal', 'Centrist', 'Conservative', 'Apolitical', 'Prefer not to say'])}
      ${profileField('MBTI', 'mbti', 'select', '', ['', 'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP', 'Don\'t know'])}
      ${pro ? '' : typeof renderProfileIcebreakerBlock === 'function' ? `<div style="margin:12px 0 8px;font-size:12px;font-weight:700;color:var(--muted);">${tHtml('profile.chat_openers_not_on_digital')}</div>${renderProfileIcebreakerBlock()}` : ''}
      ${!pro ? `${profileField(t('profile.have_children'), 'haveChildren', 'select', '', ['', 'No', 'Yes — live with me', 'Yes — don\'t live with me', 'Prefer not to say'])}${privacyInline('haveChildren', t('profile.this'))}` : ''}
      ${profileField(t('profile.instagram'), 'instagram', 'text', t('common.username'))}
      ${profileField(t('profile.twitter_x'), 'twitter', 'text', t('common.username'))}
      ${pro ? '' : `${profileField(t('profile.linkedin'), 'linkedin', 'text', t('profile.profile_url'))}${profileField(t('profile.website'), 'website', 'text', 'https://')}`}
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:8px;">${tHtml('profile.privacy')}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;">${tHtml('profile.collection_stays_on_so_chaupaal_can')}</div>
        ${profileToggle(t('profile.show_age_publicly'), 'showAge')}
        ${profileToggle(t('profile.show_location_publicly'), 'showLocation')}
        ${profileToggle(t('profile.show_relationship_looking_for'), 'showRelationship')}
        ${profileToggle(t('profile.show_income_range'), 'showIncome')}
        ${profileToggle(t('profile.show_religion'), 'showReligion')}
        ${profileField(t('profile.profile_visibility'), 'profileVisibility', 'select', '', ['public', 'Friends only', 'Private'])}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;">${tHtml('profile.optional_gps_for_peepal_proximity_never')}</div>
        <button type="button" class="btn btn--block" id="setMatchLocationBtn">${tHtml('profile.set_my_location_for_matching')}</button>
      </div>
    `;
    },
    // Legacy tab names → redirect aliases for completion section taps
    Personal: () => SECTIONS.About(),
    Relationships: () => SECTIONS['Looking for'](),
    Social: () => SECTIONS.More(),
  };

  function profileField(label,key,type,placeholder,options){
    const val=dp[key];
    if(type==='chips-single'){
      const presets=options||[];
      const selected=val||'';
      const isCustom=!!(selected && !presets.includes(selected));
      return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><div class="dp-chips dp-chips-single" data-key="${key}" style="display:flex;flex-wrap:wrap;gap:6px;">${presets.map(o=>`<button type="button" class="dp-chip${selected===o?' active':''}" data-val="${String(o).replace(/"/g,'&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid ${selected===o?'var(--red)':'var(--line)'};background:${selected===o?'rgba(230,57,70,0.08)':'var(--white)'};color:${selected===o?'var(--red)':'var(--ink)'};font-size:12px;font-weight:600;cursor:pointer;">${optionLabelHtml(key,o)}</button>`).join('')}${isCustom?`<button type="button" class="dp-chip active" data-val="${String(selected).replace(/"/g,'&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid var(--red);background:rgba(230,57,70,0.08);color:var(--red);font-size:12px;font-weight:600;cursor:pointer;">${selected} ✕</button>`:''}</div><div class="dp-chip-custom" data-key="${key}" data-single="1" style="display:flex;gap:8px;margin-top:8px;"><input type="text" maxlength="60" placeholder="${placeholder||tHtml('profile.other_type_your_own')}" style="flex:1;padding:8px 12px;border:2px solid var(--line);border-radius:10px;font-size:13px;"><button type="button" class="dp-chip-add" style="padding:8px 12px;border:0;border-radius:10px;background:var(--cream);font-weight:700;font-size:12px;cursor:pointer;">${tHtml('profile.exclusion_add')}</button></div></div>`;
    }
    if(type==='select'){
      const OTHER='__dp_other__';
      const opts=Array.isArray(options)?options.slice():[];
      const presets=opts.filter(o=>o!==OTHER);
      const isCustom=!!(val && !presets.includes(val));
      const selectVal=isCustom?OTHER:(val??'');
      const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      return`<div class="dp-select-wrap" data-key="${key}" style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div>
        <select class="dp-field dp-select" data-key="${key}" data-has-other="1" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);color:var(--ink);outline:none;cursor:pointer;">
          ${presets.map(o=>`<option value="${esc(o)}" ${selectVal===o?'selected':''}>${o?optionLabelHtml(key,o):tHtml('profile.select')}</option>`).join('')}
          <option value="${OTHER}" ${selectVal===OTHER?'selected':''}>${tHtml('profile.other_type_your_own_2')}</option>
        </select>
        <input class="dp-other-input" data-key="${key}" type="text" maxlength="120" value="${isCustom?esc(val):''}" placeholder="${tHtml('profile.type_your_own')}" style="width:100%;margin-top:8px;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;box-sizing:border-box;${isCustom?'':'display:none;'}">
      </div>`;
    }
    if(type==='textarea'){
      return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><textarea class="dp-field" data-key="${key}" placeholder="${placeholder}" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;resize:none;min-height:80px;box-sizing:border-box;line-height:1.5;">${val||''}</textarea></div>`;
    }
    if(type==='chips'){
      const selected=Array.isArray(val)?val:[];
      const presets=options||[];
      const customOnly=selected.filter(s=>!presets.includes(s));
      return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><div class="dp-chips" data-key="${key}" style="display:flex;flex-wrap:wrap;gap:6px;">${presets.map(o=>`<button type="button" class="dp-chip${selected.includes(o)?' active':''}" data-val="${o}" style="padding:6px 12px;border-radius:999px;border:2px solid ${selected.includes(o)?'var(--red)':'var(--line)'};background:${selected.includes(o)?'rgba(230,57,70,0.08)':'var(--white)'};color:${selected.includes(o)?'var(--red)':'var(--ink)'};font-size:12px;font-weight:600;cursor:pointer;">${optionLabelHtml(key,o)}</button>`).join('')}${customOnly.map(o=>`<button type="button" class="dp-chip active" data-val="${String(o).replace(/"/g,'&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid var(--red);background:rgba(230,57,70,0.08);color:var(--red);font-size:12px;font-weight:600;cursor:pointer;">${o} ✕</button>`).join('')}</div><div class="dp-chip-custom" data-key="${key}" style="display:flex;gap:8px;margin-top:8px;"><input type="text" maxlength="40" placeholder="${tHtml('profile.write_your_own_2')}" style="flex:1;padding:8px 12px;border:2px solid var(--line);border-radius:10px;font-size:13px;"><button type="button" class="dp-chip-add" style="padding:8px 12px;border:0;border-radius:10px;background:var(--cream);font-weight:700;font-size:12px;cursor:pointer;">${tHtml('profile.exclusion_add')}</button></div></div>`;
    }
    return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><input class="dp-field" data-key="${key}" type="${type}" value="${val||''}" placeholder="${placeholder}" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;box-sizing:border-box;"></div>`;
  }

  function profileToggle(label,key){
    return`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);"><span style="font-size:14px;">${label}</span><label class="switch"><input type="checkbox" class="dp-toggle" data-key="${key}" ${dp[key]?'checked':''}><span class="slider"></span></label></div>`;
  }

  async function askChaupaalForField(fieldKey, hostEl){
    if(typeof isAiFeaturesEnabledSync==='function' && !isAiFeaturesEnabledSync()){
      if(typeof showToast==='function') showToast(t('profile_ask_paused'));
      return;
    }
    if(typeof callAI!=='function'){
      if(typeof showToast==='function') showToast(t('profile_ask_unavailable'));
      return;
    }
    const btn=hostEl?.querySelector('button');
    if(btn){ btn.disabled=true; btn.textContent=t('profile.thinking'); }
    try{
      const mine={
        interests: dp.interests, hobbies: dp.hobbies,
        interestsFreeText: dp.interestsFreeText, hobbiesFreeText: dp.hobbiesFreeText,
        occupation: dp.occupation, bio: dp.bio, lookingFor: dp.lookingFor, currentCity: dp.currentCity,
      };
      const result=await callAI({
        feature:'profile_icebreakers',
        tier:'fast',
        max_tokens:220,
        lang: typeof aiUiLang==='function'?aiUiLang():undefined,
        langJson: true,
        system:'You help fill Chaupaal profile fields. Return JSON {"suggestions":["...","...","..."]} — short conversation-starter style phrases the user can paste. Use only provided profile facts.',
        messages:[{role:'user',content:JSON.stringify({field:fieldKey,profile:mine})}],
      });
      const raw=String(result?.text||result||'');
      const start=raw.indexOf('{'); const end=raw.lastIndexOf('}');
      let suggestions=[];
      if(start>=0){
        try{ suggestions=JSON.parse(raw.slice(start,end+1)).suggestions||[]; }catch(e){}
      }
      if(!suggestions.length){
        if(typeof showToast==='function') showToast(t('profile_no_suggestions'));
        return;
      }
      const pick=suggestions[0];
      const field=document.querySelector(`#profileSectionContent .dp-field[data-key="${fieldKey}"]`);
      if(field){
        field.value=(field.value?field.value.trim()+' ':'')+pick;
        saveProfileField(fieldKey, field.value);
      }
      if(typeof showToast==='function') showToast(t('profile_suggestion_added'));
    }catch(e){
      if(typeof showToast==='function') showToast(t('profile_ask_failed'));
    }finally{
      if(btn){ btn.disabled=false; btn.textContent=t('profile.take_help_from_chaupaal'); }
    }
  }

  function renderSection(sec){
    const content=document.getElementById('profileSectionContent');
    const resolved = SECTIONS[sec] ? sec : (SECTIONS.About ? 'About' : 'Personal');
    if(content) content.innerHTML=`<div style="padding:0;">${(SECTIONS[resolved]||SECTIONS.About||SECTIONS.Personal)()}</div>`;
    const OTHER='__dp_other__';
    content.querySelectorAll('.dp-ask-chaupaal').forEach(host=>{
      const key=host.dataset.for;
      host.innerHTML=`<button type="button" class="ai-kb-trigger" style="margin:0;font-size:12px;">${tHtml('profile.take_help_from_chaupaal')}</button>`;
      host.querySelector('button')?.addEventListener('click',()=>askChaupaalForField(key, host));
    });
    // Wire events — selects with "Other" handled separately so we never persist the sentinel
    content.querySelectorAll('.dp-field').forEach(f=>{
      if(f.dataset.hasOther) return;
      f.addEventListener('change',()=>saveProfileField(f.dataset.key, f.value));
      f.addEventListener('blur',()=>saveProfileField(f.dataset.key, f.value));
    });
    content.querySelectorAll('select.dp-select[data-has-other]').forEach(sel=>{
      const wrap=sel.closest('.dp-select-wrap');
      const other=wrap?.querySelector('.dp-other-input');
      const apply=()=>{
        if(sel.value===OTHER){
          if(other){ other.style.display='block'; other.focus(); }
          const typed=(other?.value||'').trim();
          if(typed) saveProfileField(sel.dataset.key, typed);
        } else {
          if(other){ other.style.display='none'; other.value=''; }
          saveProfileField(sel.dataset.key, sel.value);
        }
      };
      sel.addEventListener('change', apply);
      other?.addEventListener('change',()=>{
        if(sel.value===OTHER){
          const typed=(other.value||'').trim();
          if(typed) saveProfileField(sel.dataset.key, typed);
        }
      });
      other?.addEventListener('blur',()=>{
        if(sel.value===OTHER){
          const typed=(other.value||'').trim();
          if(typed) saveProfileField(sel.dataset.key, typed);
        }
      });
    });
    content.querySelectorAll('.dp-toggle').forEach(t=>{
      t.addEventListener('change',()=>saveProfileField(t.dataset.key, t.checked));
    });
    content.querySelectorAll('.dp-privacy-inline [data-privacy-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const showKey=btn.dataset.privacyKey;
        const audience=btn.dataset.privacyAudience;
        // public → show true; friends/private → show false (P0 projection strips from strangers)
        saveProfileField(showKey, audience === 'public');
        renderSection(resolved);
      });
    });
    content.querySelectorAll('.dp-chips:not(.dp-chips-single) .dp-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const key=chip.closest('.dp-chips').dataset.key;
        let arr=Array.isArray(dp[key])?[...dp[key]]:[];
        const val=chip.dataset.val;
        if(arr.includes(val)) arr=arr.filter(x=>x!==val);
        else arr.push(val);
        saveProfileField(key, arr);
        renderSection(resolved);
      });
    });
    content.querySelectorAll('.dp-chips-single .dp-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const key=chip.closest('.dp-chips').dataset.key;
        const val=chip.dataset.val;
        const next = dp[key] === val ? '' : val;
        saveProfileField(key, next);
        if(key==='lookingFor') saveProfileField('matchIntent', next);
        if(key==='interests' && typeof ProfileTaxonomy?.normalizeInterestList==='function'){
          /* single interest chip group is multi via other path */
        }
        renderSection(resolved);
      });
    });
    content.querySelectorAll('.dp-chip-custom').forEach(row=>{
      const key=row.dataset.key;
      const single=row.dataset.single==='1';
      const input=row.querySelector('input');
      const add=()=>{
        const typed=(input?.value||'').trim();
        if(!typed) return;
        if(single){
          saveProfileField(key, typed);
          if(key==='lookingFor') saveProfileField('matchIntent', typed);
        } else {
          let arr=Array.isArray(dp[key])?[...dp[key]]:[];
          if(!arr.includes(typed)) arr.push(typed);
          saveProfileField(key, arr);
        }
        input.value='';
        renderSection(resolved);
      };
      row.querySelector('.dp-chip-add')?.addEventListener('click', add);
      input?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); add(); }});
    });
    if(typeof wireProfilePromptsBlock==='function') wireProfilePromptsBlock(content);
    if(typeof wireProfileIcebreakerBlock==='function') wireProfileIcebreakerBlock(content);
    if(typeof wireProfileTypeToggle==='function') wireProfileTypeToggle(content);
    content.querySelector('#setMatchLocationBtn')?.addEventListener('click',()=>{
      if(typeof promptMatchLocation==='function') promptMatchLocation();
      else if(typeof showToast==='function') showToast(t('profile_loc_unavailable'));
    });
  }

  // Tab switching
  setTimeout(()=>{
    if(typeof wirePreviewToggle==='function'){
      wirePreviewToggle(el, ()=>renderProfileModal());
    }
    if(typeof mountProfileShell==='function'){
      mountProfileShell(el.querySelector('[data-own-edit-sections]'), {
        editable:true,
        isOwner:true,
        includeArchived:true,
        profile:dp,
        onCustomChange:()=>renderProfileModal(),
      });
    } else if(typeof mountOwnProfileSections==='function'){
      mountOwnProfileSections(el.querySelector('[data-own-edit-sections]'), {
        editable:true,
        isOwner:true,
        includeArchived:true,
      });
    }
    document.getElementById('profileOpenArchiveBtn')?.addEventListener('click',()=>{
      if(typeof openArchiveHub==='function') openArchiveHub('duniya');
    });
    document.getElementById('profileArchiveBtn')?.addEventListener('click',()=>{
      if(typeof openArchiveHub==='function') openArchiveHub('duniya');
    });
    el.querySelectorAll('[data-dp-hub]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const tab = btn.dataset.dpHub;
        if(typeof openArchiveHub==='function'){
          openArchiveHub(tab === 'archive' ? 'stories' : tab === 'posts' ? 'duniya' : tab);
        }
      });
    });
    el.querySelector('[data-push-history]')?.addEventListener('click',()=>{
      if(typeof PushPrefs!=='undefined' && PushPrefs.openPushHistorySheet) PushPrefs.openPushHistorySheet();
      else if(typeof openNotificationPanel==='function') openNotificationPanel('all');
    });
    el.querySelector('[data-dp-open-hub]')?.addEventListener('click',()=>{
      if(typeof openChaupaalProfileHub==='function') openChaupaalProfileHub();
    });
    el.querySelector('[data-open-chaupaal-card]')?.addEventListener('click',()=>{
      if(typeof openChaupaalIdCard==='function') openChaupaalIdCard();
      else if(typeof openChaupaalProfileHub==='function') openChaupaalProfileHub();
    });
    document.getElementById('profileSettingsGear')?.addEventListener('click',()=>{
      if(typeof openSettingsModal==='function') openSettingsModal();
    });
    el.querySelector('[data-dp-more-hub]')?.addEventListener('click',()=>{
      if(typeof showActionSheet==='function'){
        showActionSheet(t('profile.more_on_your_profile'),[
          {label:t('profile.monthly_wrap'),icon:'calendar',fn:()=>{ if(typeof showMonthlyWrap==='function') showMonthlyWrap(); }},
          {label:t('common.devices_sessions'),icon:'laptop',fn:()=>{ if(typeof openSessionsSheet==='function') openSessionsSheet(); }},
          {label:t('common.blocked_users'),icon:'ban',fn:()=>{ if(typeof openBlockedUsersSheet==='function') openBlockedUsersSheet(); }},
          {label:t('common.chaupaal_hub'),icon:'user',fn:()=>{ if(typeof openChaupaalProfileHub==='function') openChaupaalProfileHub(); }},
          {label:t('profile.chaupaal_ai_profile'),icon:'brain',fn:()=>{ if(typeof openChaupaalAiProfile==='function') openChaupaalAiProfile(); }},
        ]);
      } else if(typeof openChaupaalProfileHub==='function') openChaupaalProfileHub();
    });
    document.getElementById('profileAddSectionBtn')?.addEventListener('click',()=>{
      if(typeof openAddProfileSectionSheet==='function'){
        openAddProfileSectionSheet(()=>renderProfileModal());
      }
    });
    if(typeof wireTabNotificationButtons==='function') wireTabNotificationButtons();
    if(typeof updateSectionNotifDots==='function') updateSectionNotifDots();
    document.getElementById('profileSectionTabs')?.querySelectorAll('.profile-section-tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        document.querySelectorAll('.profile-section-tab').forEach(t=>{
          t.classList.toggle('active', t === tab);
          t.style.color='';
          t.style.borderBottom='';
        });
        renderSection(tab.dataset.sec);
      });
    });
    renderSection('About');
    if(typeof refreshProfileCompletionUI==='function') refreshProfileCompletionUI();
    el.querySelectorAll('[data-complete-section]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const id=btn.getAttribute('data-complete-section');
        const pro = typeof ProfileTaxonomy?.isProfessional === 'function' && ProfileTaxonomy.isProfessional();
        const map = pro
          ? { identity: 'About', social: 'About', relationship: 'Career', career: 'Career', trust: 'About' }
          : { identity: 'About', social: 'About', relationship: 'Looking for', career: 'Lifestyle', trust: 'About' }; // i18n-ignore (section ids)
        const sec=map[id]||'About';
        const tab=document.querySelector(`#profileSectionTabs .profile-section-tab[data-sec="${sec}"]`);
        if(tab) tab.click();
        else renderSection(sec);
        const content=document.getElementById('profileSectionContent');
        try{ content?.scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){}
        const focusKey={identity:'bio',social:'currentCity',relationship:'relationshipStatus',career:'occupation',trust:'displayName'}[id];
        setTimeout(()=>{
          const field=document.querySelector(`#profileSectionContent .dp-field[data-key="${focusKey}"]`);
          field?.focus();
        },80);
      });
    });
    if(typeof maybeOfferProfileCompleteNudge==='function'){
      setTimeout(()=>maybeOfferProfileCompleteNudge({reason:'edit'}),700);
    }
    document.getElementById('switchProfileBtn')?.addEventListener('click',()=>{
      if(typeof openAccountSwitcher==='function') openAccountSwitcher();
      else if(typeof openProfileSwitcher==='function') openProfileSwitcher();
      else if(typeof showToast==='function') showToast(t('profile_switcher_loading'));
    });
    el.querySelectorAll('[data-account-switch]').forEach((node)=>{
      node.addEventListener('click',()=>{
        if(typeof openAccountSwitcher==='function') openAccountSwitcher();
        else if(typeof openProfileSwitcher==='function') openProfileSwitcher();
      });
    });
    document.getElementById('logoutBtn')?.addEventListener('click',async()=>{
      if(typeof endCurrentSessionQuietly==='function') endCurrentSessionQuietly();
      if(typeof stopNotifInbox==='function') stopNotifInbox();
      if(typeof stopChatPresence==='function') stopChatPresence();
      document.getElementById('profileModal')?.classList.add('hidden');
      const uid = currentUser?.uid;
      if(typeof AuthProfiles!=='undefined' && AuthProfiles.removeAccountFromDevice && uid){
        await AuthProfiles.removeAccountFromDevice(uid);
        if(typeof showToast==='function') showToast(t('profile_see_you'));
        return;
      }
      await auth.signOut();currentUser=null;userProfile=null;
      showToast(t('profile_see_you'));
    });
    document.getElementById('ownProfileStoryAvatar')?.addEventListener('click',()=>{
      const p=userProfile||{};
      const dp=digitalProfile||{};
      if(typeof openAvatarLightbox==='function'){
        openAvatarLightbox({
          photoURL:dp.photoURL||p.photoURL||p.photoThumb||'',
          name:dp.displayName||p.name||p.displayName||'You',
          uid:currentUser?.uid||'',
          username:dp.username||p.username||'',
          avatar:p.avatar,
        });
      }
    });
    document.getElementById('toggleAvatarDisplayBtn')?.addEventListener('click',async()=>{
      if(typeof setAvatarDisplayMode!=='function'||typeof getAvatarDisplay!=='function') return;
      const next=getAvatarDisplay(ownProfileForAvatar(userProfile,digitalProfile))==='gift'?'photo':'gift';
      await setAvatarDisplayMode(next);
      renderProfileModal();
      if(typeof updateProfileBtn==='function') updateProfileBtn();
      if(typeof renderBaithakInbox==='function') renderBaithakInbox();
    });
    document.getElementById('profilePhotoInput')?.addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file||!file.type.startsWith('image/'))return;
      try{
        showToast(t('profile_updating_photo'));
        let photoURL='';
        let thumbURL='';
        if(typeof uploadOptimizedImage==='function'&&currentUser&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
          const up=await uploadOptimizedImage(file,{folder:'avatars'});
          photoURL=up.media;
          thumbURL=up.thumb;
        } else {
          photoURL=URL.createObjectURL(file);
          thumbURL=photoURL;
        }
        if(auth?.currentUser) await auth.currentUser.updateProfile({photoURL});
        if(userProfile){
          userProfile.photoURL=photoURL;
          userProfile.photoThumb=thumbURL;
          userProfile.avatarDisplay='photo';
        }
        if(db&&currentUser){
          db.collection('users').doc(currentUser.uid).update({photoURL,photoThumb:thumbURL||null,avatarDisplay:'photo'}).then(()=>{
            if(typeof UsersPublic?.syncPublicProfile==='function'){
              UsersPublic.syncPublicProfile(currentUser.uid, {...(userProfile||{}), photoURL, photoThumb:thumbURL||null, avatarDisplay:'photo'});
            }
          }).catch(()=>{});
        }
        const prevPhotos=Array.isArray(digitalProfile.photos)?[...digitalProfile.photos]:[];
        if(!prevPhotos.length){
          digitalProfile.photos=[photoURL];
          try{localStorage.setItem('chaupaal_digital_profile',JSON.stringify(digitalProfile));}catch(e){}
          if(typeof onProfileFieldSaved==='function') onProfileFieldSaved('photos', digitalProfile.photos, {photos:[]});
          else if(typeof refreshProfileCompletionUI==='function') refreshProfileCompletionUI();
        } else if(typeof refreshProfileCompletionUI==='function') refreshProfileCompletionUI();
        renderProfileModal();
        if(typeof updateProfileBtn==='function') updateProfileBtn();
        showToast(t('profile_photo_updated'));
      }catch(err){
        showToast(errorText(err, t('profile_photo_fail')));
      }
    });
    if(typeof mountOwnRelationshipPanel==='function') mountOwnRelationshipPanel(document.getElementById('profileContent'));
    const el2=document.getElementById('profileContent');
    if(el2)renderFriendDiscovery(el2);
  },50);
}

function saveProfileField(key, value){
  const prev=typeof digitalProfile==='object'?JSON.parse(JSON.stringify(digitalProfile)):{};
  let nextVal = value;
  if (key === 'interests' && typeof ProfileTaxonomy?.normalizeInterestList === 'function' && Array.isArray(value)) {
    nextVal = ProfileTaxonomy.normalizeInterestList(value);
  }
  if (key === 'lookingFor' || key === 'matchIntent') {
    digitalProfile.lookingFor = nextVal;
    digitalProfile.matchIntent = nextVal;
  } else {
    digitalProfile[key] = nextVal;
  }
  try{localStorage.setItem('chaupaal_digital_profile',JSON.stringify(digitalProfile));}catch(e){}

  // Retroactive DOB → under-18: require parental consent / teen mode
  if(key==='dateOfBirth'||key==='dob'){
    try{
      const age=typeof ageFromDob==='function'?ageFromDob(value):0;
      if(typeof isBlockedAge==='function'&&isBlockedAge(age)){
        if(typeof showToast==='function') showToast(t('profile.chaupaal_is_for_ages_13_and'));
        digitalProfile[key]=prev[key];
        return;
      }
      if(typeof isTeenAge==='function'&&isTeenAge(age)){
        if(userProfile){
          userProfile.teenMode=true;
          userProfile.isMinor=true;
          userProfile.age=age;
        }
        if(db&&currentUser){
          db.collection('users').doc(currentUser.uid).set({
            teenMode:true,
            isMinor:true,
            age,
            [`profile.${key}`]:value,
          },{merge:true}).catch(()=>{});
        }
        if(typeof needsParentalConsent==='function'&&needsParentalConsent({...userProfile,age,teenMode:true})&&typeof openParentalConsentSheet==='function'){
          setTimeout(()=>openParentalConsentSheet(),400);
        }else if(typeof showToast==='function'){
          showToast(t('profile.teen_mode_on_some_features_stay'));
        }
      }
    }catch(e){}
  }

  if(db&&currentUser){
    const patch={[`profile.${key}`]:nextVal};
    if(key==='lookingFor' || key==='matchIntent'){
      patch['profile.lookingFor']=nextVal;
      patch['profile.matchIntent']=nextVal;
      patch.matchIntent=String(nextVal||'').trim();
      patch.lookingFor=String(nextVal||'').trim();
    }
    if(key==='interests') patch.interests = nextVal;
    if(key==='purpose') patch.purpose = nextVal;
    if(key==='industry') patch.industry = nextVal;
    const after=()=>{
      if(typeof UsersPublic?.syncPublicProfile==='function'){
        const merged={...(userProfile||{}), profile:{...(userProfile?.profile||{}), ...digitalProfile, [key]:nextVal}};
        if(key==='lookingFor' || key==='matchIntent') merged.matchIntent=String(nextVal||'').trim();
        UsersPublic.syncPublicProfile(currentUser.uid, merged);
      }
    };
    db.collection('users').doc(currentUser.uid).update(patch).then(after).catch(()=>{
      db.collection('users').doc(currentUser.uid).set(patch,{merge:true}).then(after).catch((e)=>{
        // Both write paths failed — the edit the user just made is NOT saved.
        if(typeof reportClientError==='function') reportClientError({feature:'profile_save',message:`${key}: ${e?.message||e}`});
        if(typeof showToast==='function') showToast(t('profile_save_fail'));
      });
    });
  }
  if(typeof refreshProfileCompletionUI==='function') refreshProfileCompletionUI();
  if(typeof onProfileFieldSaved==='function') onProfileFieldSaved(key, nextVal, prev);
  if(['bio','interests','hobbies','prompts','occupation','currentCity','lookingFor'].includes(key)&&typeof scheduleProfileEmbeddingRefresh==='function'){
    scheduleProfileEmbeddingRefresh(key);
  }
}


// Wire chip fields inside the profile modal (event delegation since content regenerates)
document.getElementById('profileModal').addEventListener('click',(e)=>{
  const chip=e.target.closest('.dp-chip');
  if(!chip)return;
  const singleRow=chip.closest('[data-field]');
  const multiRow=chip.closest('[data-field-multi]');
  if(singleRow){
    const field=singleRow.dataset.field;
    digitalProfile[field]=chip.dataset.val;
    singleRow.querySelectorAll('.dp-chip').forEach(c=>c.classList.remove('selected'));
    chip.classList.add('selected');
    saveProfileField(field, digitalProfile[field]);
  } else if(multiRow){
    const field=multiRow.dataset.fieldMulti;
    digitalProfile[field]=digitalProfile[field]||[];
    const val=chip.dataset.val;
    const idx=digitalProfile[field].indexOf(val);
    if(idx>-1){digitalProfile[field].splice(idx,1);chip.classList.remove('selected');}
    else{digitalProfile[field].push(val);chip.classList.add('selected');}
    saveProfileField(field, digitalProfile[field]);
  }
});
