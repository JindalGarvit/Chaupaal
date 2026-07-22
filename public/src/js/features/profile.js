// ===================== PROFILE MODAL — FULL DIGITAL PROFILE =====================
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
    el.innerHTML = typeof renderOwnPreviewChromeHtml==='function'
      ? renderOwnPreviewChromeHtml(dp, p)
      : (typeof renderStrangerPreviewHtml==='function'
        ? renderStrangerPreviewHtml(dp, p)
        : '<p style="color:var(--muted);">Preview unavailable</p>');
    setTimeout(()=>{
      if(typeof wirePreviewToggle==='function'){
        wirePreviewToggle(el, ()=>renderProfileModal());
      }
      if(typeof mountOwnProfileSections==='function'){
        mountOwnProfileSections(el.querySelector('[data-own-preview-sections]'), {
          editable:false,
          isOwner:true,
          includeArchived:true,
        });
      }
      if(typeof wireTabNotificationButtons==='function') wireTabNotificationButtons();
      if(typeof updateSectionNotifDots==='function') updateSectionNotifDots();
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

  el.innerHTML=`
    ${typeof renderPreviewToggleHtml==='function'?renderPreviewToggleHtml():''}
    <div class="own-profile-edit-toolbar">
      <button type="button" class="icon-btn profile-agg-notif" data-open-notif="all" aria-label="All notifications" title="Notifications" style="position:relative;">
        🔔<span class="notif-dot hidden" data-notif-dot="all"></span>
      </button>
      <button type="button" class="btn" id="profileOpenArchiveBtn">Archive</button>
      <button type="button" class="btn btn--primary" id="profileAddSectionBtn" title="Add section">＋</button>
    </div>
    <!-- Profile header -->
    <div style="display:flex;align-items:center;gap:14px;padding:16px 0 14px;">
      <div style="position:relative;flex-shrink:0;">
        <div id="ownProfileStoryAvatar" style="width:72px;height:72px;border-radius:50%;background:var(--line);overflow:hidden;border:3px solid var(--red);display:flex;align-items:center;justify-content:center;font-size:32px;cursor:pointer;">
          ${p.photoURL?`<img src="${p.photoURL}" style="width:100%;height:100%;object-fit:cover;">`:'🪑'}
        </div>
        <label style="position:absolute;bottom:0;right:0;background:var(--red);width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid var(--white);font-size:11px;color:#fff;">
          ✎<input type="file" accept="image/*" id="profilePhotoInput" style="display:none;">
        </label>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;" data-pro-badge-self data-pro-badge-name="${(displayName||'').replace(/"/g,'&quot;')}">${nameHtml}</div>
        <div style="font-size:12px;color:var(--muted);">@${p.username||'username'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${[dp.currentCity,dp.occupation].filter(Boolean).join(' · ')||'Add your city & job'}</div>
      </div>
    </div>
    <div class="own-edit-sections" data-own-edit-sections></div>
    <!-- Completeness bar -->
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;">
        <span>Profile completeness</span><span data-ui="profile-completion-pct" style="color:${pct>=80?'var(--green)':'var(--red)'};">${pct}%</span>
      </div>
      <div style="height:5px;background:var(--line);border-radius:99px;overflow:hidden;">
        <div data-ui="profile-completion-bar" style="height:100%;width:${pct}%;background:${pct>=80?'#2ECC71':'var(--red)'};border-radius:99px;transition:width .5s ease;"></div>
      </div>
      <div data-ui="profile-completion-hint" style="font-size:11px;color:var(--muted);margin-top:5px;${pct<60?'':'display:none;'}">${stats.missing?.length?`Add ${stats.missing.slice(0,3).join(', ')} to improve discovery ✨`:'Complete your profile to appear in more Peepal discoveries ✨'}</div>
    </div>
    <!-- Section tabs -->
    <div style="display:flex;gap:0;border-bottom:2px solid var(--line);margin-bottom:0;overflow-x:auto;flex-shrink:0;" id="profileSectionTabs">
      ${['Personal','Career','Lifestyle','Relationships','Social'].map((s,i)=>`<button class="profile-section-tab${i===0?' active':''}" data-sec="${s}" style="padding:10px 14px;border:none;background:none;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;color:${i===0?'var(--red)':'var(--muted)'};border-bottom:${i===0?'2px solid var(--red)':'none'};margin-bottom:-2px;">${s}</button>`).join('')}
    </div>
    <div id="profileSectionContent" style="padding:16px 0;"></div>
    <!-- Actions -->
    <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px;">
      <div data-profile-relationship-counts class="relationship-counts-loading">Loading relationships…</div>
      <div data-friend-requests></div>
      <button class="btn btn--primary btn--block modal-btn" id="manageCloseFriendsBtn" style="margin-top:12px;background:var(--navy);">Close Friends</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:12px;" onclick="showMonthlyWrap()">📊 Monthly Wrap</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:8px;background:linear-gradient(135deg,var(--navy),#2A3158);color:#fff;" onclick="openArchive()">🗄️ My Archive</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:8px;background:var(--navy);color:#fff;" onclick="openStoryArchive()">Story Archive</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:8px;" onclick="typeof openRecoveryBin==='function'&&openRecoveryBin()">🗑️ Recently deleted</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:8px;" onclick="typeof openSessionsSheet==='function'&&openSessionsSheet()">💻 Devices & sessions</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:8px;" onclick="typeof openBlockedUsersSheet==='function'&&openBlockedUsersSheet()">🚫 Blocked users</button>
      <button class="btn btn--primary btn--block modal-btn" style="margin-top:8px;background:linear-gradient(135deg,#C9A227,#8134AF);color:#fff;" onclick="openPremiumSheet()">⭐ Go Premium</button>
      <button type="button" class="btn btn--primary btn--block modal-btn" id="switchProfileBtn" style="width:100%;margin-bottom:8px;">👤 Switch / add profile</button>
      <button class="logout-btn" id="logoutBtn">Log out</button>
    </div>
  `;

  // Section rendering
  const SECTIONS={
    Personal:()=>`
      ${profileField('Name','displayName','text','Your full name')}
      ${profileField('Bio','bio','textarea','A short bio about yourself...')}
      ${profileField('Gender','gender','select','',['','Male','Female','Non-binary','Prefer not to say'])}
      ${profileField('Pronouns','pronouns','select','',['','He/Him','She/Her','They/Them','Any'])}
      ${profileField('Date of Birth','dateOfBirth','date','')}
      ${profileField('Birthplace','birthplace','text','City, Country')}
      ${profileField('Hometown','hometown','text','Where you grew up')}
      ${profileField('Current City','currentCity','text','Where you live now')}
      ${profileField('Nationality','nationality','text','Your nationality')}
      ${profileField('Languages spoken','languages','chips','Add languages',['Hindi','English','Tamil','Telugu','Marathi','Bengali','Gujarati','Kannada','Malayalam','Punjabi','Urdu','Odia','Assamese','Konkani'])}
      ${profileField('Things that excite me','interests','chips','Add interests',['Travel','Food','Startups','Films','Music','Fitness','Books','Politics','Tech','Fashion','Art','Animals','Nature','Spirituality','Comedy','Sports','Gaming','Photography','Cooking','Volunteer work'])}
      ${typeof renderProfilePromptsBlock==='function'?renderProfilePromptsBlock():''}
      ${typeof renderProfileIcebreakerBlock==='function'?renderProfileIcebreakerBlock():''}
      ${profileField('Height','height','select','',['','Under 5ft','5ft','5ft 1in','5ft 2in','5ft 3in','5ft 4in','5ft 5in','5ft 6in','5ft 7in','5ft 8in','5ft 9in','5ft 10in','5ft 11in','6ft','6ft 1in','6ft 2in','6ft+'])}
      ${profileField('Blood Group','bloodGroup','select','',['','A+','A-','B+','B-','AB+','AB-','O+','O-','Don\'t know'])}
      ${profileField('Religion','religion','select','',['','Hindu','Muslim','Christian','Sikh','Buddhist','Jain','Jewish','Parsi','Atheist','Agnostic','Spiritual but not religious','Prefer not to say'])}
    `,
    Career:()=>`
      ${profileField('Occupation / Job title','occupation','text','What do you do?')}
      ${profileField('Company / Organisation','company','text','Where do you work?')}
      ${profileField('Industry','industry','select','',['','Technology','Finance & Banking','Healthcare','Education','Media & Entertainment','Government','Legal','Real Estate','Retail','Manufacturing','Agriculture','Hospitality','Consulting','NGO / Non-profit','Student','Freelancer','Entrepreneur','Other'])}
      ${profileField('Work mode','workMode','select','',['','In-office','Remote','Hybrid','Freelance','Between jobs'])}
      ${profileField('Career level','careerLevel','select','',['','Student / Intern','Entry level (0-2 yrs)','Mid level (3-6 yrs)','Senior (7-10 yrs)','Lead / Manager','Director / VP','C-Suite / Founder','Retired'])}
      ${profileField('Annual income (optional)','annualIncome','select','',['','Prefer not to say','Under ₹3L','₹3L-6L','₹6L-10L','₹10L-20L','₹20L-40L','₹40L-75L','₹75L-1Cr','Above ₹1Cr'])}
      ${profileField('Highest education','highestEducation','select','',['','High school','Diploma','Bachelor\'s','Master\'s','PhD / Doctorate','Professional degree (CA/CS/MBBS etc)','Other'])}
      ${profileField('College / University','college','text','Where did you study?')}
      ${profileField('Degree / Major','degree','text','Your field of study')}
      ${profileField('Graduation year','graduationYear','text','e.g. 2020')}
      ${profileField('Skills','skills','chips','Add skills',['Leadership','Public speaking','Writing','Coding','Design','Data analysis','Marketing','Sales','Finance','Research','Teaching','Management','Strategy','Product','Operations'])}
    `,
    Lifestyle:()=>`
      ${profileField('Diet','diet','select','',['','Omnivore','Vegetarian','Eggetarian','Vegan','Jain','Keto','Gluten-free','Other'])}
      ${profileField('Drinking','drinking','select','',['','Never','Socially','Occasionally','Regularly','Prefer not to say'])}
      ${profileField('Smoking','smoking','select','',['','Never','Occasionally','Regularly','Trying to quit','Prefer not to say'])}
      ${profileField('Fitness','fitness','select','',['','Very active (daily workout)','Active (3-4x/week)','Moderately active','Occasionally active','Not into fitness'])}
      ${profileField('Sleep schedule','sleepSchedule','select','',['','Early bird (before 10pm)','Regular (10pm-12am)','Night owl (12am-2am)','Very late (2am+)','Varies'])}
      ${profileField('Personality type (MBTI)','mbti','select','',['','INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP','Don\'t know'])}
      ${profileField('Zodiac','zodiac','select','',['','Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'])}
      ${profileField('Political views','politics','select','',['','Progressive','Liberal','Centrist','Conservative','Libertarian','Apolitical','Prefer not to say'])}
      ${profileField('Spirituality','spirituality','select','',['','Deeply religious','Religious','Somewhat spiritual','Agnostic','Atheist','Exploring'])}
      ${profileField('Hobbies','hobbies','chips','Add hobbies',['Reading','Writing','Photography','Cooking','Gaming','Gardening','DIY/Crafts','Collecting','Podcasting','Blogging','Volunteering','Meditation','Yoga','Hiking','Cycling','Swimming','Dancing','Painting','Singing','Playing music'])}
      ${profileField('Sports','sports','chips','Add sports',['Cricket','Football','Badminton','Tennis','Chess','Table Tennis','Basketball','Volleyball','Athletics','Swimming','Cycling','Golf','Boxing','Wrestling','Kabaddi','Kho Kho'])}
      ${profileField('Music taste','music','chips','Add genres',['Bollywood','Punjabi','Classical','Jazz','Rock','Pop','Hip-hop','Electronic','Folk','Indie','R&B','Metal'])}
      ${profileField('Movies / Shows','movies','chips','Add genres',['Bollywood','Hollywood','South Indian','Thriller','Comedy','Drama','Sci-fi','Horror','Documentary','Animation','Romance','Action'])}
      ${profileField('Dream destination','dreamDestination','text','Where do you most want to visit?')}
      ${profileField('Life goals','lifeGoals','textarea','What are you working towards?')}
      ${profileField('Core values','coreValues','chips','Add values',['Family','Ambition','Freedom','Creativity','Loyalty','Honesty','Adventure','Security','Faith','Growth','Humour','Independence','Empathy','Justice'])}
    `,
    Relationships:()=>`
      ${profileField('Relationship status','relationshipStatus','select','',['','Single','Single — not open to dating','Single — open to friendship only','Single — open to casual dating','Single — open to serious relationship only','Single — only open to marriage','In a relationship','Married','Separated','Divorced','Widowed','In an open relationship','It\'s complicated','Prefer not to say'])}
      ${profileField('Looking for','lookingFor','select','',['','Friendship','Dating','Marriage','Co-founder / Collaborator','Study buddy','Workout buddy','Mentorship','Language exchange','Flatmate / Roommate','Networking / Professional connections','Job hunt','Casual dating','Serious relationship','Activity partner','Travel buddy','Nothing specific','Open to anything'])}
      ${profileField('Do you have children?','haveChildren','select','',['','No','Yes — live with me','Yes — don\'t live with me','Prefer not to say'])}
      ${profileField('Want children?','wantChildren','select','',['','Yes','No','Open to it','Already have enough','Prefer not to say'])}
      ${profileField('Living situation','livingSituation','select','',['','Live alone','With family','With roommates','With partner','In hostel/PG','In college dorm','Other'])}
      ${profileField('Family type (grew up in)','familyType','select','',['','Nuclear family','Joint family','Single parent','Extended family','Foster/adopted','Other'])}
      ${profileField('Siblings','siblings','select','',['','Only child','1 sibling','2 siblings','3+ siblings','Prefer not to say'])}
      ${profileField('Open to long distance?','longDistance','select','',['','Yes','No','Depends','Prefer not to say'])}
      ${profileField('Marital history','maritalHistory','select','',['','Never married','Divorced','Widowed','Prefer not to say'])}
    `,
    Social:()=>`
      ${typeof renderProfileTypeToggleHtml==='function'?renderProfileTypeToggleHtml():''}
      ${profileField('Instagram','instagram','text','@username')}
      ${profileField('Twitter / X','twitter','text','@username')}
      ${profileField('LinkedIn','linkedin','text','Profile URL or username')}
      ${profileField('YouTube','youtube','text','Channel name')}
      ${profileField('Personal website','website','text','https://')}
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:12px;">Privacy settings</div>
        ${profileToggle('Show age publicly','showAge')}
        ${profileToggle('Show location publicly','showLocation')}
        ${profileToggle('Show relationship status','showRelationship')}
        ${profileToggle('Show income range','showIncome')}
        ${profileToggle('Show religion','showReligion')}
        ${profileField('Profile visibility','profileVisibility','select','',['public','Friends only','Private'])}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:6px;">Nearby matching</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.4;">Optional GPS for Peepal proximity. Never required — only used when you opt in.</div>
        <button type="button" class="btn btn--block" id="setMatchLocationBtn">📍 Set my location for matching</button>
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:8px;">Chaupaal ratings</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${NEWS_CATEGORIES.map(cat=>`<div style="background:var(--cream);border-radius:10px;padding:10px;text-align:center;"><div style="font-size:11px;color:var(--muted);">${CATEGORY_ICONS[cat]} ${cat}</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;color:var(--red);">${(userProfile?.categoryRatings||{})[cat]||1200}</div></div>`).join('')}
        </div>
      </div>
    `,
  };

  function profileField(label,key,type,placeholder,options){
    const val=dp[key];
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

  function renderSection(sec){
    const content=document.getElementById('profileSectionContent');
    if(content) content.innerHTML=`<div style="padding:0;">${(SECTIONS[sec]||SECTIONS.Personal)()}</div>`;
    const OTHER='__dp_other__';
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
    content.querySelectorAll('.dp-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const key=chip.closest('.dp-chips').dataset.key;
        let arr=Array.isArray(dp[key])?[...dp[key]]:[];
        const val=chip.dataset.val;
        if(arr.includes(val)) arr=arr.filter(x=>x!==val);
        else arr.push(val);
        saveProfileField(key, arr);
        renderSection(sec);
      });
    });
    content.querySelectorAll('.dp-chip-custom').forEach(row=>{
      const key=row.dataset.key;
      const input=row.querySelector('input');
      const add=()=>{
        const typed=(input?.value||'').trim();
        if(!typed) return;
        let arr=Array.isArray(dp[key])?[...dp[key]]:[];
        if(!arr.includes(typed)) arr.push(typed);
        saveProfileField(key, arr);
        input.value='';
        renderSection(sec);
      };
      row.querySelector('.dp-chip-add')?.addEventListener('click', add);
      input?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); add(); }});
    });
    if(typeof wireProfilePromptsBlock==='function') wireProfilePromptsBlock(content);
    if(typeof wireProfileIcebreakerBlock==='function') wireProfileIcebreakerBlock(content);
    if(typeof wireProfileTypeToggle==='function') wireProfileTypeToggle(content);
    content.querySelector('#setMatchLocationBtn')?.addEventListener('click',()=>{
      if(typeof promptMatchLocation==='function') promptMatchLocation();
      else if(typeof showToast==='function') showToast('Location sharing unavailable');
    });
  }

  // Tab switching
  setTimeout(()=>{
    if(typeof wirePreviewToggle==='function'){
      wirePreviewToggle(el, ()=>renderProfileModal());
    }
    if(typeof mountOwnProfileSections==='function'){
      mountOwnProfileSections(el.querySelector('[data-own-edit-sections]'), {
        editable:true,
        isOwner:true,
        includeArchived:true,
      });
    }
    document.getElementById('profileOpenArchiveBtn')?.addEventListener('click',()=>{
      if(typeof openArchiveHub==='function') openArchiveHub('posts');
      else if(typeof openArchive==='function') openArchive();
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
        document.querySelectorAll('.profile-section-tab').forEach(t=>{t.style.color='var(--muted)';t.style.borderBottom='none';});
        tab.style.color='var(--red)';tab.style.borderBottom='2px solid var(--red)';
        renderSection(tab.dataset.sec);
      });
    });
    renderSection('Personal');
    document.getElementById('switchProfileBtn')?.addEventListener('click',()=>{
      if(typeof openProfileSwitcher==='function') openProfileSwitcher();
      else if(typeof showToast==='function') showToast('Profile switcher loading…');
    });
    document.getElementById('logoutBtn')?.addEventListener('click',async()=>{
      if(typeof endCurrentSessionQuietly==='function') endCurrentSessionQuietly();
      await auth.signOut();currentUser=null;userProfile=null;
      document.getElementById('profileModal').classList.add('hidden');
      showToast('See you next time! 🙏');
    });
    document.getElementById('manageCloseFriendsBtn')?.addEventListener('click',()=>openCloseFriendsManager());
    document.getElementById('ownProfileStoryAvatar')?.addEventListener('click',()=>openProfileStories(currentUser.uid));
    document.getElementById('profilePhotoInput')?.addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file||!file.type.startsWith('image/'))return;
      try{
        showToast('Updating photo…');
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
        }
        if(db&&currentUser){
          db.collection('users').doc(currentUser.uid).update({photoURL,photoThumb:thumbURL||null}).then(()=>{
            if(typeof UsersPublic?.syncPublicProfile==='function'){
              UsersPublic.syncPublicProfile(currentUser.uid, {...(userProfile||{}), photoURL, photoThumb:thumbURL||null});
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
        showToast('Photo updated ✓');
      }catch(err){
        showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||'Photo update failed'));
      }
    });
    if(typeof mountOwnRelationshipPanel==='function') mountOwnRelationshipPanel(document.getElementById('profileContent'));
    const el2=document.getElementById('profileContent');
    if(el2)renderFriendDiscovery(el2);
  },50);
}

function saveProfileField(key, value){
  const prev=typeof digitalProfile==='object'?JSON.parse(JSON.stringify(digitalProfile)):{};
  digitalProfile[key]=value;
  try{localStorage.setItem('chaupaal_digital_profile',JSON.stringify(digitalProfile));}catch(e){}
  if(db&&currentUser){
    const patch={[`profile.${key}`]:value};
    if(key==='lookingFor') patch.matchIntent=String(value||'').trim();
    const after=()=>{
      if(typeof UsersPublic?.syncPublicProfile==='function'){
        const merged={...(userProfile||{}), profile:{...(userProfile?.profile||{}), ...digitalProfile, [key]:value}};
        if(key==='lookingFor') merged.matchIntent=String(value||'').trim();
        UsersPublic.syncPublicProfile(currentUser.uid, merged);
      }
    };
    db.collection('users').doc(currentUser.uid).update(patch).then(after).catch(()=>{
      db.collection('users').doc(currentUser.uid).set(patch,{merge:true}).then(after).catch(()=>{});
    });
  }
  if(typeof refreshProfileCompletionUI==='function') refreshProfileCompletionUI();
  if(typeof onProfileFieldSaved==='function') onProfileFieldSaved(key, value, prev);
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
