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
    el.innerHTML=`<p style="color:var(--muted);font-size:14px;margin-bottom:16px;">Sign in to see your profile, add friends and challenge people.</p><button class="btn btn--primary btn--block btn--lg auth-btn" onclick="document.getElementById('profileModal').classList.add('hidden');showAuth()">Sign in / Sign up</button>`;
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
        : '<p style="color:var(--muted);">Preview unavailable</p>');
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
  const displayName=dp.displayName||p.name||'Your Name';
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
    ?(typeof t==='function'&&t('avatar_use_photo')!=='avatar_use_photo'?t('avatar_use_photo'):'Use my photo')
    :(typeof t==='function'&&t('avatar_use_gift')!=='avatar_use_gift'?t('avatar_use_gift'):'Use Chaupaal avatar');

  el.innerHTML=`
    ${typeof renderPreviewToggleHtml==='function'?renderPreviewToggleHtml():''}
    ${p.needsEmailForPasswordLogin?`<div class="profile-password-login-note" style="margin:0 0 12px;padding:12px 14px;border-radius:12px;background:rgba(230,57,70,0.08);border:1.5px solid rgba(230,57,70,0.22);font-size:12px;line-height:1.45;color:var(--ink);">Add an email to enable password login with your phone number.</div>`:''}
    <div class="dp-hero dp-hero--premium">
      <div class="dp-hero-top">
        <div class="dp-hero-avatar-wrap">
          <div id="ownProfileStoryAvatar" class="dp-hero-avatar squircle-avatar">
            ${avatarHtml}
          </div>
          <label class="dp-hero-edit" title="Change photo">
            ✎<input type="file" accept="image/*" id="profilePhotoInput" style="display:none;">
          </label>
          ${showAvatarToggle?`<button type="button" class="dp-avatar-mode-btn" id="toggleAvatarDisplayBtn">${avatarToggleLabel}</button>`:''}
        </div>
        <div class="dp-hero-actions" role="group" aria-label="Profile tools">
          <button type="button" class="icon-btn dp-hero-action" id="profileArchiveBtn" aria-label="Archive" title="Archive">${typeof iconHtml==='function'?iconHtml('archive',{size:20}):''}</button>
          <button type="button" class="icon-btn dp-hero-action" id="profileSettingsGear" aria-label="Settings" title="Settings">${typeof iconHtml==='function'?iconHtml('settings',{size:20}):''}</button>
        </div>
      </div>
      <div class="dp-hero-copy">
        <div class="dp-hero-name" data-account-switch data-pro-badge-self data-pro-badge-name="${(displayName||'').replace(/"/g,'&quot;')}" style="cursor:pointer;" title="Switch account">${nameHtml}</div>
        <div class="dp-hero-handle" data-account-switch style="cursor:pointer;" title="Switch account">@${p.username||'username'}</div>
        <div class="dp-hero-meta">${[dp.currentCity,dp.occupation].filter(Boolean).join(' · ')||'Add your city & job'}</div>
        ${pct < 95 ? `<div class="dp-hero-complete">
          <div class="dp-hero-complete-row">
            <span>Profile</span>
            <span data-ui="profile-completion-pct">${pct}%</span>
          </div>
          <div class="dp-hero-complete-track">
            <div data-ui="profile-completion-bar" style="width:${pct}%"></div>
          </div>
          <div class="dp-hero-sections" role="list">
            ${['identity','social','relationship','career','trust'].map((id)=>{
              const sec=stats.sections?.[id]||{pct:0};
              const hide=id==='relationship' && (stats.hideRelationship || (typeof teenHideDatingIntents==='function' && teenHideDatingIntents()));
              const labels={identity:'Identity',social:'Social',relationship:'Relationship',career:'Career',trust:'Trust'};
              return `<button type="button" class="dp-hero-section${sec.complete?' is-complete':''}" data-complete-section="${id}" ${hide?'hidden':''} role="listitem">
                <span class="dp-hero-section-lab">${labels[id]}</span>
                <span class="dp-hero-section-track"><span data-section-bar style="width:${sec.pct||0}%"></span></span>
                <span data-section-pct>${sec.pct||0}%</span>
              </button>`;
            }).join('')}
          </div>
          <div data-ui="profile-completion-hint" class="dp-hero-complete-hint">${stats.missing?.length?`Next: ${stats.missing.slice(0,2).join(', ')}`:'Looking good — this Profile feels like you.'}</div>
        </div>` : ''}
      </div>
    </div>
    <div class="dp-rel-strip">
      <div data-profile-relationship-counts class="relationship-counts-loading">Loading relationships…</div>
      <div data-friend-requests></div>
    </div>
    <button type="button" class="chaupaal-id-card" data-open-chaupaal-card aria-label="Chaupaal card">
      <span class="chaupaal-id-card-mark" aria-hidden="true">🪑</span>
      <span class="chaupaal-id-card-copy">
        <strong data-i18n="chaupaal_card_title">Chaupaal card</strong>
        <small data-i18n="chaupaal_card_sub">Shareable identity · Hub · Membership</small>
      </span>
      <span class="chaupaal-id-card-chev" aria-hidden="true">›</span>
    </button>
    <div class="own-profile-edit-toolbar dp-toolbar dp-hub-row">
      <button type="button" class="btn profile-notif-entry" data-open-notif="all" aria-label="Notifications">
        <span data-i18n="profile_notifications">Inbox</span>
        <span class="notif-dot hidden" data-notif-dot="all" aria-hidden="true"></span>
      </button>
      <button type="button" class="btn" data-dp-hub="interactions">Activity</button>
      <button type="button" class="btn" data-push-history>Notif history</button>
      <button type="button" class="btn" data-dp-hub="journal">Journal</button>
      <button type="button" class="btn" data-dp-hub="stories">Highlights</button>
      <button type="button" class="btn" data-dp-more-hub>More</button>
      <button type="button" class="btn btn--primary" id="profileAddSectionBtn" title="Add section">＋</button>
    </div>
    <div class="own-edit-sections" data-own-edit-sections></div>
    <p class="dp-reorder-hint">Highlights sit above tabs · Profile / Duniya / Peepal are fixed · ＋ adds custom tabs · edit section items drag to rearrange</p>
    <div class="dp-field-tabs" id="profileSectionTabs">
      ${(typeof ProfileTaxonomy?.isProfessional === 'function' && ProfileTaxonomy.isProfessional()
        ? ['About', 'Career', 'Links', 'More']
        : ['About', 'Looking for', 'Lifestyle', 'More']
      )
        .map((s, i) => `<button type="button" class="profile-section-tab${i === 0 ? ' active' : ''}" data-sec="${s}">${s}</button>`)
        .join('')}
    </div>
    <div id="profileSectionContent" class="dp-field-body"></div>
    <div class="dp-account-strip">
      <button type="button" class="btn btn--primary btn--block" data-dp-open-hub>Chaupaal Hub · trust, Money, devices</button>
      <button type="button" class="btn btn--block" id="switchProfileBtn">Switch / add account</button>
      <button type="button" class="logout-btn" id="logoutBtn">Log out</button>
    </div>
  `;

  // Section rendering — Glance/Act first; Power under More. Personal vs Professional templates.
  const TX = typeof ProfileTaxonomy !== 'undefined' ? ProfileTaxonomy : {};
  const interestChips = TX.INTEREST_CHIPS || ['Travel', 'Food', 'Films', 'Music', 'Fitness', 'Books', 'Tech', 'Sports', 'Gaming'];
  const cityChips = TX.CITY_CHIPS || ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'];
  const matchIntents = TX.MATCH_INTENTS || ['Friendship', 'Dating', 'Networking / Professional connections'];
  const proIntents = TX.PRO_INTENTS || matchIntents;
  const industries = TX.INDUSTRIES || ['Technology', 'Education', 'Media & Entertainment', 'Entrepreneur', 'Other'];
  const purposes = TX.PURPOSES || ['Grow my network', 'Find collaborators', 'Share my work'];
  const skillChips = TX.SKILL_CHIPS || ['Leadership', 'Writing', 'Coding', 'Design', 'Marketing'];

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
        ? `<div style="font-size:11px;color:var(--muted);margin:4px 0 0;line-height:1.35;">Used for matching when visible.</div>`
        : '';
    if (!showKey) {
      return `<div style="font-size:11px;color:var(--muted);margin:-8px 0 12px;">Default: ${def} · change in Privacy under More</div>${matching}`;
    }
    return `<div class="dp-privacy-inline" data-privacy-for="${key}" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:-6px 0 12px;">
      <span style="font-size:11px;color:var(--muted);">Who sees ${label || 'this'}?</span>
      ${['public', 'friends', 'private']
        .map((a) => {
          const active =
            (a === 'public' && dp[showKey] === true) ||
            (a === 'private' && dp[showKey] === false) ||
            (a === 'friends' && dp[showKey] !== true && dp[showKey] !== false && def === 'friends') ||
            (a === 'private' && dp[showKey] !== true && def === 'private' && dp[showKey] !== false);
          // friends mapped as show* = false for relationship? P0: showRelationship false hides from public.
          // public = show true; private/friends = show false (friends still get friend_projection when Friends only profile).
          return `<button type="button" class="dp-chip${active ? ' active' : ''}" data-privacy-key="${showKey}" data-privacy-audience="${a}" style="padding:4px 10px;font-size:11px;border-radius:999px;border:1.5px solid ${active ? 'var(--red)' : 'var(--line)'};background:${active ? 'rgba(230,57,70,0.08)' : 'var(--white)'};color:${active ? 'var(--red)' : 'var(--ink)'};cursor:pointer;">${a}</button>`;
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
      ${profileField('Name', 'displayName', 'text', 'Your full name')}
      ${profileField('Bio', 'bio', 'textarea', 'A short bio about yourself...')}
      ${payoffLine('bio')}
      ${profileField('Gender', 'gender', 'select', '', ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'])}
      ${profileField('Pronouns', 'pronouns', 'select', '', ['', 'He/Him', 'She/Her', 'They/Them', 'Any'])}
      ${profileField('Date of Birth', 'dateOfBirth', 'date', '')}
      ${profileField('Current City', 'currentCity', 'chips-single', 'City', cityChips)}
      ${payoffLine('currentCity')}
      ${profileField('Languages spoken', 'languages', 'chips', 'Add languages', ['Hindi', 'English', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'])}
      ${profileField('Things that excite me', 'interests', 'chips', 'Add interests', interestChips)}
      ${payoffLine('interests')}
      ${profileField('Interests in your words', 'interestsFreeText', 'textarea', 'Optional — whatever you care about, in your own words')}
      <div class="dp-ask-chaupaal" data-for="interestsFreeText" style="margin:-6px 0 14px;"></div>
      ${pro ? '' : typeof renderProfilePromptsBlock === 'function' ? renderProfilePromptsBlock() : ''}
      ${pro ? `${profileField('Occupation / Role', 'occupation', 'text', 'What do you do?')}${payoffLine('occupation')}` : ''}
    `;
    },
    'Looking for': () => {
      const teen = typeof teenHideDatingIntents === 'function' && teenHideDatingIntents();
      if (teen) {
        return `<p style="font-size:13px;color:var(--muted);line-height:1.45;padding:8px 0;">Dating asks stay off in Teen Mode. Friendship and study intents can live in Interests.</p>`;
      }
      return `
      ${profileField('Relationship status', 'relationshipStatus', 'select', '', ['', 'Single', 'In a relationship', 'Married', 'Prefer not to say', 'It\'s complicated'])}
      ${privacyInline('relationshipStatus', 'relationship')}
      ${profileField('Looking for', 'lookingFor', 'chips-single', '', matchIntents)}
      ${privacyInline('lookingFor', 'looking for')}
      ${payoffLine('lookingFor')}
    `;
    },
    Career: () => `
      ${profileField('Occupation / Job title', 'occupation', 'text', 'What do you do?')}
      <div class="dp-ask-chaupaal" data-for="occupation" style="margin:-6px 0 14px;"></div>
      ${profileField('Company / Organisation', 'company', 'text', 'Where do you work?')}
      ${profileField('Industry', 'industry', 'chips-single', '', industries)}
      ${payoffLine('industry')}
      ${profileField('Purpose on Chaupaal', 'purpose', 'chips-single', '', purposes)}
      ${payoffLine('purpose')}
      ${profileField('Open to', 'lookingFor', 'chips-single', '', proIntents)}
      ${profileField('Skills', 'skills', 'chips', 'Add skills', skillChips)}
      ${payoffLine('skills')}
      ${profileField('Work mode', 'workMode', 'select', '', ['', 'In-office', 'Remote', 'Hybrid', 'Freelance', 'Between jobs'])}
      ${profileField('Career level', 'careerLevel', 'select', '', ['', 'Student / Intern', 'Entry level (0-2 yrs)', 'Mid level (3-6 yrs)', 'Senior (7-10 yrs)', 'Lead / Manager', 'Director / VP', 'C-Suite / Founder'])}
      ${profileField('Annual income (optional)', 'annualIncome', 'select', '', ['', 'Prefer not to say', 'Under ₹3L', '₹3L-6L', '₹6L-10L', '₹10L-20L', '₹20L-40L', 'Above ₹40L'])}
      ${privacyInline('annualIncome', 'income')}
    `,
    Links: () => `
      ${profileField('LinkedIn', 'linkedin', 'text', 'Profile URL or username')}
      ${payoffLine('linkedin')}
      ${profileField('Website / portfolio', 'website', 'text', 'https://')}
      ${payoffLine('website')}
      ${profileField('Instagram', 'instagram', 'text', '@username')}
      ${profileField('YouTube', 'youtube', 'text', 'Channel name')}
    `,
    Lifestyle: () => `
      ${profileField('Diet', 'diet', 'select', '', ['', 'Omnivore', 'Vegetarian', 'Eggetarian', 'Vegan', 'Jain', 'Other'])}
      ${profileField('Drinking', 'drinking', 'select', '', ['', 'Never', 'Socially', 'Occasionally', 'Regularly', 'Prefer not to say'])}
      ${profileField('Smoking', 'smoking', 'select', '', ['', 'Never', 'Occasionally', 'Regularly', 'Trying to quit', 'Prefer not to say'])}
      ${profileField('Fitness', 'fitness', 'select', '', ['', 'Very active (daily workout)', 'Active (3-4x/week)', 'Moderately active', 'Occasionally active', 'Not into fitness'])}
      ${profileField('Core values', 'coreValues', 'chips', 'Add values', ['Family', 'Ambition', 'Freedom', 'Creativity', 'Loyalty', 'Honesty', 'Adventure', 'Growth', 'Humour', 'Empathy'])}
    `,
    More: () => {
      const pro = typeof TX.isProfessional === 'function' && TX.isProfessional();
      return `
      <div style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.4;">Power layer — optional details. Nothing here is required.</div>
      ${profileField('Hometown', 'hometown', 'text', 'Where you grew up')}
      ${profileField('Height', 'height', 'select', '', ['', 'Under 5ft', '5ft', '5ft 2in', '5ft 4in', '5ft 6in', '5ft 8in', '5ft 10in', '6ft', '6ft+'])}
      ${profileField('Religion', 'religion', 'select', '', ['', 'Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Atheist', 'Agnostic', 'Spiritual but not religious', 'Prefer not to say'])}
      ${privacyInline('religion', 'religion')}
      ${profileField('Politics', 'politics', 'select', '', ['', 'Progressive', 'Liberal', 'Centrist', 'Conservative', 'Apolitical', 'Prefer not to say'])}
      ${profileField('MBTI', 'mbti', 'select', '', ['', 'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP', 'Don\'t know'])}
      ${pro ? '' : typeof renderProfileIcebreakerBlock === 'function' ? `<div style="margin:12px 0 8px;font-size:12px;font-weight:700;color:var(--muted);">Chat openers (not on Digital)</div>${renderProfileIcebreakerBlock()}` : ''}
      ${!pro ? `${profileField('Have children?', 'haveChildren', 'select', '', ['', 'No', 'Yes — live with me', 'Yes — don\'t live with me', 'Prefer not to say'])}${privacyInline('haveChildren', 'this')}` : ''}
      ${profileField('Instagram', 'instagram', 'text', '@username')}
      ${profileField('Twitter / X', 'twitter', 'text', '@username')}
      ${pro ? '' : `${profileField('LinkedIn', 'linkedin', 'text', 'Profile URL')}${profileField('Website', 'website', 'text', 'https://')}`}
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:8px;">Privacy</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;">Collection stays on so Chaupaal can match you better — turn off anything you don’t want shared.</div>
        ${profileToggle('Show age publicly', 'showAge')}
        ${profileToggle('Show location publicly', 'showLocation')}
        ${profileToggle('Show relationship / looking for', 'showRelationship')}
        ${profileToggle('Show income range', 'showIncome')}
        ${profileToggle('Show religion', 'showReligion')}
        ${profileField('Profile visibility', 'profileVisibility', 'select', '', ['public', 'Friends only', 'Private'])}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;">Optional GPS for Peepal proximity. Never required.</div>
        <button type="button" class="btn btn--block" id="setMatchLocationBtn">Set my location for matching</button>
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
      return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><div class="dp-chips dp-chips-single" data-key="${key}" style="display:flex;flex-wrap:wrap;gap:6px;">${presets.map(o=>`<button type="button" class="dp-chip${selected===o?' active':''}" data-val="${String(o).replace(/"/g,'&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid ${selected===o?'var(--red)':'var(--line)'};background:${selected===o?'rgba(230,57,70,0.08)':'var(--white)'};color:${selected===o?'var(--red)':'var(--ink)'};font-size:12px;font-weight:600;cursor:pointer;">${o}</button>`).join('')}${isCustom?`<button type="button" class="dp-chip active" data-val="${String(selected).replace(/"/g,'&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid var(--red);background:rgba(230,57,70,0.08);color:var(--red);font-size:12px;font-weight:600;cursor:pointer;">${selected} ✕</button>`:''}</div><div class="dp-chip-custom" data-key="${key}" data-single="1" style="display:flex;gap:8px;margin-top:8px;"><input type="text" maxlength="60" placeholder="${placeholder||'Other — type your own'}" style="flex:1;padding:8px 12px;border:2px solid var(--line);border-radius:10px;font-size:13px;"><button type="button" class="dp-chip-add" style="padding:8px 12px;border:0;border-radius:10px;background:var(--cream);font-weight:700;font-size:12px;cursor:pointer;">Add</button></div></div>`;
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
          ${presets.map(o=>`<option value="${esc(o)}" ${selectVal===o?'selected':''}>${o||'Select...'}</option>`).join('')}
          <option value="${OTHER}" ${selectVal===OTHER?'selected':''}>Other (type your own)</option>
        </select>
        <input class="dp-other-input" data-key="${key}" type="text" maxlength="120" value="${isCustom?esc(val):''}" placeholder="Type your own…" style="width:100%;margin-top:8px;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;box-sizing:border-box;${isCustom?'':'display:none;'}">
      </div>`;
    }
    if(type==='textarea'){
      return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><textarea class="dp-field" data-key="${key}" placeholder="${placeholder}" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;resize:none;min-height:80px;box-sizing:border-box;line-height:1.5;">${val||''}</textarea></div>`;
    }
    if(type==='chips'){
      const selected=Array.isArray(val)?val:[];
      const presets=options||[];
      const customOnly=selected.filter(s=>!presets.includes(s));
      return`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${label}</div><div class="dp-chips" data-key="${key}" style="display:flex;flex-wrap:wrap;gap:6px;">${presets.map(o=>`<button type="button" class="dp-chip${selected.includes(o)?' active':''}" data-val="${o}" style="padding:6px 12px;border-radius:999px;border:2px solid ${selected.includes(o)?'var(--red)':'var(--line)'};background:${selected.includes(o)?'rgba(230,57,70,0.08)':'var(--white)'};color:${selected.includes(o)?'var(--red)':'var(--ink)'};font-size:12px;font-weight:600;cursor:pointer;">${o}</button>`).join('')}${customOnly.map(o=>`<button type="button" class="dp-chip active" data-val="${String(o).replace(/"/g,'&quot;')}" style="padding:6px 12px;border-radius:999px;border:2px solid var(--red);background:rgba(230,57,70,0.08);color:var(--red);font-size:12px;font-weight:600;cursor:pointer;">${o} ✕</button>`).join('')}</div><div class="dp-chip-custom" data-key="${key}" style="display:flex;gap:8px;margin-top:8px;"><input type="text" maxlength="40" placeholder="Write your own…" style="flex:1;padding:8px 12px;border:2px solid var(--line);border-radius:10px;font-size:13px;"><button type="button" class="dp-chip-add" style="padding:8px 12px;border:0;border-radius:10px;background:var(--cream);font-weight:700;font-size:12px;cursor:pointer;">Add</button></div></div>`;
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
    if(btn){ btn.disabled=true; btn.textContent='Thinking…'; }
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
      if(btn){ btn.disabled=false; btn.textContent='✨ Take help from Chaupaal'; }
    }
  }

  function renderSection(sec){
    const content=document.getElementById('profileSectionContent');
    const resolved = SECTIONS[sec] ? sec : (SECTIONS.About ? 'About' : 'Personal');
    if(content) content.innerHTML=`<div style="padding:0;">${(SECTIONS[resolved]||SECTIONS.About||SECTIONS.Personal)()}</div>`;
    const OTHER='__dp_other__';
    content.querySelectorAll('.dp-ask-chaupaal').forEach(host=>{
      const key=host.dataset.for;
      host.innerHTML=`<button type="button" class="ai-kb-trigger" style="margin:0;font-size:12px;">✨ Take help from Chaupaal</button>`;
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
        showActionSheet('More on your profile',[
          {label:'Monthly wrap',icon:'calendar',fn:()=>{ if(typeof showMonthlyWrap==='function') showMonthlyWrap(); }},
          {label:'Devices & sessions',icon:'laptop',fn:()=>{ if(typeof openSessionsSheet==='function') openSessionsSheet(); }},
          {label:'Blocked users',icon:'ban',fn:()=>{ if(typeof openBlockedUsersSheet==='function') openBlockedUsersSheet(); }},
          {label:'Chaupaal Hub',icon:'user',fn:()=>{ if(typeof openChaupaalProfileHub==='function') openChaupaalProfileHub(); }},
          {label:'Chaupaal AI profile',icon:'brain',fn:()=>{ if(typeof openChaupaalAiProfile==='function') openChaupaalAiProfile(); }},
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
          : { identity: 'About', social: 'About', relationship: 'Looking for', career: 'Lifestyle', trust: 'About' };
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
        showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||t('profile_photo_fail')));
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
        if(typeof showToast==='function') showToast('Chaupaal is for ages 13 and up');
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
          showToast('Teen Mode on — some features stay friend-only until a parent verifies');
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
