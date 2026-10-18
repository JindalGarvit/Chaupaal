// ===================== SAMPLE DISCOVERY POOL =====================
const SAMPLE_DISCOVERY_POOL = /* i18n-copy */ [
  {uid:'u_riya',name:'Riya Sharma',avatar:'😊',photoURL:null,city:'Mumbai',age:24,gender:'female',personality:'social',openToMeet:true,profileType:'personal',interests:['Sports','Tech','Music'],bio:t('discovery.cricket_on_weekends_startups_on_weekdays'),questions:12,icebreakers:[{promptId:'ib14',answer:t('discovery.cutting_chai_extra_adrak_non_negotiable')}]},
  {uid:'u_arjun',name:'Arjun Mehta',avatar:'🏔️',photoURL:null,city:'Delhi',age:27,gender:'male',personality:'outdoorsy',openToMeet:true,profileType:'personal',interests:['Sports','Travel','World'],bio:t('discovery.always_planning_the_next_trek'),questions:8,icebreakers:[{promptId:'ib18',answer:t('discovery.road_trip_windows_down_random_dhabas')}]},
  {uid:'u_priya',name:'Priya Nair',avatar:'👩',photoURL:null,city:'Bengaluru',age:25,gender:'female',personality:'intellectual',openToMeet:true,profileType:'professional',interests:['Tech','Business','GK'],bio:t('discovery.product_manager_who_loves_quizzes'),questions:20,icebreakers:[{promptId:'ib05',answer:'Filter coffee forever. Tea is lovely; coffee is a personality.'},{promptId:'ib15',answer:t('discovery.church_street_walk_then_that_tiny')}]},
  {uid:'u_dev',name:'Dev Sharma',avatar:'👨',photoURL:null,city:'Pune',age:29,gender:'male',personality:'intellectual',openToMeet:true,profileType:'personal',interests:['Business','World','GK'],bio:t('discovery.reading_non_fiction_and_debating'),questions:15,icebreakers:[{promptId:'ib10',answer:t('discovery.a_stranger_returned_my_dropped_metro')}]},
  {uid:'u_ananya',name:'Ananya Iyer',avatar:'🎨',photoURL:null,city:'Chennai',age:23,gender:'female',personality:'cinephile',openToMeet:true,profileType:'personal',interests:['Movies','Music','Food'],bio:t('discovery.film_festivals_filter_coffee'),questions:6,icebreakers:[{promptId:'ib16',answer:t('discovery.pongal_the_kolam_the_sugarcane_the')}]},
  {uid:'u_kabir',name:'Kabir Singh',avatar:'🎮',photoURL:null,city:'Hyderabad',age:26,gender:'male',personality:'social',openToMeet:true,profileType:'personal',interests:['Tech','Sports','Music'],bio:t('discovery.gamer_coder_chai_addict'),questions:10,icebreakers:[{promptId:'ib14',answer:t('discovery.irani_chai_osmania_biscuit_hilltop_debates')}]},
  {uid:'u_meera',name:'Meera Kapoor',avatar:'📚',photoURL:null,city:'Jaipur',age:28,gender:'female',personality:'intellectual',openToMeet:true,profileType:'professional',interests:['GK','World','Travel'],bio:t('discovery.history_nerd_who_loves_museums'),questions:18,icebreakers:[{promptId:'ib17',answer:t('discovery.khamma_ghani_say_it_once_and')}]},
  {uid:'u_rohan',name:'Rohan Kapoor',avatar:'👨‍💻',photoURL:null,city:'Mumbai',age:30,gender:'male',personality:'intellectual',openToMeet:true,profileType:'professional',interests:['Tech','Business','Sports'],bio:t('discovery.building_something_new'),questions:9,icebreakers:[{promptId:'ib19',answer:t('discovery.pottery_on_weekends_hands_full_of')}]},
  {uid:'u_sneha',name:'Sneha Joshi',avatar:'🌱',photoURL:null,city:'Mumbai',age:22,gender:'female',personality:'outdoorsy',openToMeet:true,profileType:'personal',interests:['Travel','Food','World'],bio:t('discovery.looking_for_travel_buddies'),questions:5,icebreakers:[{promptId:'ib15',answer:t('discovery.sunset_at_bandra_bandstand_then_whatever')}]},
  {uid:'u_vikram',name:'Vikram Rao',avatar:'🏏',photoURL:null,city:'Ahmedabad',age:31,gender:'male',personality:'social',openToMeet:true,profileType:'personal',interests:['Sports','Business','India'],bio:t('discovery.ipl_nights_and_chai_debates'),questions:14,icebreakers:[{promptId:'ib14',answer:t('discovery.cutting_chai_with_extra_sugar_fight')}]},
];

let dismissedUids = new Set(JSON.parse(localStorage.getItem('chaupaal_dismissed_uids')||'[]'));
let discoveryCurrentSet = [];
let discoveryPreviousSet = [];
const DISCOVERY_FILTER_KEY = 'chaupaal_discovery_filters';
let discoveryFilters = (() => {
  try {
    return {
      interest: 'any',
      matchIntent: '',
      sameCity: false,
      recentlyJoined: false,
      industry: '',
      purpose: '',
      ...JSON.parse(localStorage.getItem(DISCOVERY_FILTER_KEY) || '{}'),
    };
  } catch (e) {
    return { interest: 'any', matchIntent: '', sameCity: false, recentlyJoined: false, industry: '', purpose: '' };
  }
})();

const PEEPAL_MATCH_INTENTS = /* i18n-values: intent */ [
  'Friendship',
  'Dating',
  'Marriage',
  'Co-founder / Collaborator',
  'Study buddy',
  'Workout buddy',
  'Mentorship',
  'Language exchange',
  'Flatmate / Roommate',
  'Networking / Professional connections',
  'Job hunt',
  'Travel buddies',
];

let discoveryMatchMeta = {
  intentProfileId: null,
  intentText: '',
  byUid: {},
};
let discoveryImpressionTimers = {};

function logDiscoveryEngagement(candidateUid, outcome) {
  if (typeof apiFetch !== 'function' || !discoveryMatchMeta.intentProfileId || !candidateUid) return;
  const meta = discoveryMatchMeta.byUid[candidateUid] || {};
  apiFetch('/api/peepal-reactions', {
    method: 'POST',
    needAuth: true,
    body: {
      action: 'log_match_engagement',
      intentProfileId: discoveryMatchMeta.intentProfileId,
      intentText: discoveryMatchMeta.intentText,
      candidateUid,
      signalScores: meta.signalScores || {},
      outcome,
    },
  }).catch(() => {});
}

function scheduleDiscoveryIgnored(uid) {
  if (!uid || discoveryImpressionTimers[uid]) return;
  discoveryImpressionTimers[uid] = setTimeout(() => {
    delete discoveryImpressionTimers[uid];
    if (dismissedUids.has(uid)) return;
    logDiscoveryEngagement(uid, 'ignored');
  }, 45000);
}

function discoveryJoinedAt(user) {
  return user?.createdAt?.toMillis?.() || user?.createdAt?.toDate?.()?.getTime?.() || Number(user?.createdAt || user?.joinedAt || 0) || 0;
}

function isRecentlyJoined(user) {
  const joined = discoveryJoinedAt(user);
  return joined > 0 && Date.now() - joined <= 30 * 24 * 60 * 60 * 1000;
}

function saveDiscoveryFilters() {
  try { localStorage.setItem(DISCOVERY_FILTER_KEY, JSON.stringify(discoveryFilters)); } catch (e) {}
}

function clearDiscoveryFilters() {
  discoveryFilters.interest = 'any';
  discoveryFilters.matchIntent = '';
  discoveryFilters.sameCity = false;
  discoveryFilters.recentlyJoined = false;
  discoveryFilters.industry = '';
  discoveryFilters.purpose = '';
  saveDiscoveryFilters();
}

function getDiscoveryFilterPayload() {
  return {
    interest: discoveryFilters.interest || 'any',
    matchIntent: discoveryFilters.matchIntent || '',
    sameCity: !!discoveryFilters.sameCity,
    recentlyJoined: !!discoveryFilters.recentlyJoined,
    industry: discoveryFilters.industry || '',
    purpose: discoveryFilters.purpose || '',
  };
}

function discoveryFiltersActiveCount() {
  let n = 0;
  if (discoveryFilters.sameCity) n++;
  if (discoveryFilters.recentlyJoined) n++;
  if (discoveryFilters.interest && discoveryFilters.interest !== 'any') n++;
  if (discoveryFilters.matchIntent) n++;
  if (discoveryFilters.industry) n++;
  if (discoveryFilters.purpose) n++;
  return n;
}

function isViewerProfessional() {
  try {
    if (typeof getProfileType === 'function') return getProfileType() === 'professional';
  } catch (e) {}
  return false;
}

/** Compact Khoj filters markup — progressive disclosure (hidden until Filters tapped). */
function renderKhojFiltersMarkup() {
  const f = discoveryFilters;
  const isPro = isViewerProfessional();
  const intents = PEEPAL_MATCH_INTENTS.map(
    (i) => `<option value="${i}" ${f.matchIntent === i ? 'selected' : ''}>${optionLabelHtml('intent', i)}</option>`
  ).join('');
  const interestOpts = /* i18n-values: akhbaar.cat */ ['Sports', 'Tech', 'Business', 'Music', 'Food', 'Travel', 'Movies', 'GK', 'India', 'World']
    .map((i) => `<option value="${i}" ${f.interest === i ? 'selected' : ''}>${optionLabelHtml('akhbaar.cat', i)}</option>`)
    .join('');
  const customSel =
    f.matchIntent && !PEEPAL_MATCH_INTENTS.includes(f.matchIntent) ? 'selected' : '';
  const industries =
    (typeof ProfileTaxonomy !== 'undefined' && ProfileTaxonomy.INDUSTRIES) ||
    /* i18n-values: industry */ ['Technology', 'Finance', 'Healthcare', 'Education', 'Media & Entertainment', 'Consulting', 'Startup', 'Other'];
  const purposes =
    (typeof ProfileTaxonomy !== 'undefined' && ProfileTaxonomy.PURPOSES) ||
    /* i18n-values: purpose */ ['Grow my network', 'Find collaborators', 'Hire talent', 'Find work', 'Learn from peers'];
  const indOpts = industries
    .map((i) => `<option value="${i}" ${f.industry === i ? 'selected' : ''}>${i}</option>`)
    .join('');
  const purOpts = purposes
    .map((i) => `<option value="${i}" ${f.purpose === i ? 'selected' : ''}>${i}</option>`)
    .join('');
  const showProFilters = isPro || /job|network|co-founder|mentor|hir|career/i.test(String(f.matchIntent || ''));
  return `
    <div class="khoj-filters-bar">
      <button type="button" class="khoj-filters-toggle" id="khojFiltersToggle" aria-expanded="false">
        ${discoveryFiltersActiveCount() ? tHtml('discovery.filters_n', { n: discoveryFiltersActiveCount() }) : tHtml('discovery.filters')}
      </button>
      <button type="button" class="khoj-filters-clear${discoveryFiltersActiveCount() ? '' : ' hidden'}" id="khojFiltersClear" title="${tHtml('discovery.clear_filters')}">${tHtml('common.clear')}</button>
    </div>
    <div class="khoj-filters-panel hidden" id="khojFiltersPanel" hidden>
      <label class="khoj-filter-field">
        <span>${tHtml('discovery.intent')}</span>
        <select data-discovery-filter="matchIntent" aria-label="${tHtml('discovery.match_intent')}">
          <option value="">${tHtml('discovery.profile_default')}</option>
          ${intents}
          <option value="__custom__" ${customSel}>${tHtml('discovery.something_else')}</option>
        </select>
      </label>
      <label class="khoj-filter-field">
        <span>${tHtml('discovery.interest')}</span>
        <select data-discovery-filter="interest" aria-label="${tHtml('discovery.filter_by_interest')}">
          <option value="any">${tHtml('discovery.all_interests')}</option>
          ${interestOpts}
        </select>
      </label>
      ${
        showProFilters
          ? `<label class="khoj-filter-field">
        <span>${tHtml('common.industry')}</span>
        <select data-discovery-filter="industry" aria-label="${tHtml('common.industry')}">
          <option value="">${tHtml('discovery.any_industry')}</option>
          ${indOpts}
        </select>
      </label>
      <label class="khoj-filter-field">
        <span>${tHtml('common.purpose')}</span>
        <select data-discovery-filter="purpose" aria-label="${tHtml('common.purpose')}">
          <option value="">${tHtml('discovery.any_purpose')}</option>
          ${purOpts}
        </select>
      </label>`
          : ''
      }
      <label class="khoj-filter-check"><input type="checkbox" data-discovery-filter="sameCity" ${f.sameCity ? 'checked' : ''}> ${tHtml('discovery.same_city')}</label>
      <label class="khoj-filter-check"><input type="checkbox" data-discovery-filter="recentlyJoined" ${f.recentlyJoined ? 'checked' : ''}> ${tHtml('discovery.new_here')}</label>
    </div>`;
}

/**
 * Wire Khoj filter controls. onChange(payload) after save — reload peeks / re-run Find.
 */
function wireKhojFilters(root, onChange) {
  const scope = root || document;
  const panel = scope.querySelector('#khojFiltersPanel');
  const toggle = scope.querySelector('#khojFiltersToggle');
  const clearBtn = scope.querySelector('#khojFiltersClear');
  const syncChrome = () => {
    const n = discoveryFiltersActiveCount();
    if (toggle) toggle.textContent = n ? t('discovery.filters_n', { n }) : t('discovery.filters');
    clearBtn?.classList.toggle('hidden', !n);
  };
  toggle?.addEventListener('click', () => {
    const open = panel && !panel.classList.contains('hidden');
    if (panel) {
      panel.classList.toggle('hidden', open);
      panel.hidden = open;
    }
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  });
  clearBtn?.addEventListener('click', () => {
    clearDiscoveryFilters();
    scope.querySelectorAll('[data-discovery-filter]').forEach((el) => {
      const key = el.dataset.discoveryFilter;
      if (el.type === 'checkbox') el.checked = false;
      else if (key === 'interest') el.value = 'any';
      else el.value = '';
    });
    syncChrome();
    if (typeof onChange === 'function') onChange(getDiscoveryFilterPayload());
  });
  scope.querySelectorAll('[data-discovery-filter]').forEach((control) => {
    control.addEventListener('change', async () => {
      const key = control.dataset.discoveryFilter;
      if (key === 'matchIntent' && control.value === '__custom__') {
        const typed =
          typeof promptNameSheet === 'function'
            ? await promptNameSheet({
                title: t('discovery.match_intent'),
                placeholder: t('discovery.what_are_you_looking_for'),
                confirmLabel: t('discovery.use'),
              })
            : window.prompt(t('discovery.what_are_you_looking_for'));
        if (!typed) {
          control.value = discoveryFilters.matchIntent || '';
          return;
        }
        discoveryFilters.matchIntent = String(typed).trim().slice(0, 80);
      } else {
        discoveryFilters[key] = control.type === 'checkbox' ? control.checked : control.value;
      }
      saveDiscoveryFilters();
      syncChrome();
      if (typeof onChange === 'function') onChange(getDiscoveryFilterPayload());
    });
  });
  syncChrome();
}

async function getDiscoveryProfiles(){
  // Personal hybrid matchmaking (filters + embeddings + Gale-Shapley) when account is personal
  const viewerType =
    typeof getProfileType === 'function' ? getProfileType() : 'personal';
  if (
    typeof currentUser !== 'undefined' &&
    currentUser &&
    typeof apiFetch === 'function' &&
    (viewerType === 'personal' || viewerType === 'professional')
  ) {
    try {
      const intentText =
        (discoveryFilters.matchIntent && String(discoveryFilters.matchIntent).trim()) ||
        (viewerType === 'professional'
          ? userProfile?.purpose ||
            digitalProfile?.purpose ||
            userProfile?.matchIntent ||
            'networking'
          : userProfile?.matchIntent ||
            userProfile?.lookingFor ||
            digitalProfile?.lookingFor ||
            '');
      const action = viewerType === 'professional' ? 'professional_match' : 'personal_match';
      const envelope = await apiFetch('/api/peepal-reactions', {
        method: 'POST',
        needAuth: true,
        body: {
          action,
          sameCity: !!discoveryFilters.sameCity,
          recentlyJoined: !!discoveryFilters.recentlyJoined,
          industry: discoveryFilters.industry || '',
          purpose: discoveryFilters.purpose || '',
          filters: typeof getDiscoveryFilterPayload === 'function' ? getDiscoveryFilterPayload() : {},
          intent: intentText,
          limit: 5,
        },
      });
      const matches = envelope?.data?.matches || [];
      discoveryMatchMeta = {
        intentProfileId: envelope?.data?.intentProfileId || null,
        intentText: envelope?.data?.intentText || intentText,
        byUid: {},
      };
      matches.forEach((m) => {
        if (!m?.uid) return;
        discoveryMatchMeta.byUid[m.uid] = {
          signalScores: m.signalScores || {},
        };
        scheduleDiscoveryIgnored(m.uid);
      });
      if (matches.length) {
        const out = matches
          .filter((m) => m?.uid && !dismissedUids.has(m.uid))
          .filter((m) => !discoveryFilters.recentlyJoined || isRecentlyJoined(m))
          .filter((m) => isDiscoveryEligibleUser({ uid: m.uid, ...m }))
          .map((m) => ({
            user: {
              uid: m.uid,
              name: m.name,
              username: m.username,
              photoURL: m.photoURL,
              city: m.city,
              age: m.age,
              bio: m.bio,
              interests: m.interests || [],
              icebreakers: m.icebreakers || [],
              prompts: m.prompts || [],
              industry: m.industry || '',
              purpose: m.purpose || '',
              openToMeet: true,
              profileType:
                m.profileType ||
                m.profile?.profileType ||
                (viewerType === 'professional' ? 'professional' : 'personal'),
              _isNew: isRecentlyJoined(m),
              _mutualStable: m.mutualStable,
            },
            score: m.score || 50,
            reasons: (m.signals || []).slice(0, 3),
            reason:
              (m.signals || []).slice(0, 2).join(' · ') ||
              m.explain ||
              m.bio ||
              (viewerType === 'professional'
                ? t('discovery.someone_you_might_work_with_on')
                : t('discovery.someone_you_might_enjoy_talking_to')),
          }));
        if (typeof enrichUsersWithProfileType === 'function') {
          await enrichUsersWithProfileType(out.map((p) => p.user).filter(Boolean));
        }
        return out;
      }
      // Signed-in empty from match API — honest empty, no SAMPLE pad
      return [];
    } catch (e) {
      // Fall back to local heuristics
    }
  }

  // K0: never seed SAMPLE into signed-in discovery. Guests may use labeled samples only.
  const signedIn = typeof currentUser !== 'undefined' && !!currentUser;
  const pool = signedIn ? [] : [...SAMPLE_DISCOVERY_POOL].map((u) => ({ ...u, isSample: true }));
  if (db && currentUser) {
    try{
      const snap = await db.collection('users_public').where('openToMeet','==',true).limit(40).get();
      snap.docs.forEach(d=>{
        const u=d.data();
        const uid=u.uid||d.id;
        if(u.hiddenFromDiscovery) return;
        if(uid!==currentUser.uid && u.name && !pool.find(p=>p.uid===uid)){
          pool.push({
            ...u,
            uid,
            icebreakers: typeof resolveIcebreakersFromUser==='function'
              ? resolveIcebreakersFromUser(u)
              : (u.icebreakers||u.profile?.icebreakers||[]),
          });
        }
      });
    }catch(e){}
    // Merge a small newest-user window so "New here" is not dependent on the
    // arbitrary first 40 open profiles. No location permission is involved.
    try{
      const recentSnap=await db.collection('users_public').orderBy('createdAt','desc').limit(12).get();
      recentSnap.docs.forEach(d=>{
        const u=d.data()||{};
        const uid=u.uid||d.id;
        if(u.hiddenFromDiscovery) return;
        if(uid===currentUser.uid||u.openToMeet===false||!u.name||pool.find(p=>p.uid===uid)) return;
        pool.push({...u,uid});
      });
    }catch(e){}
  }

  const myInterests = new Set([
    ...(personalityProfile?.interests||[]),
    ...(typeof digitalProfile!=='undefined'&&digitalProfile?.interests||[]),
    ...(myCategories||[]).map(c=>c.name),
  ].map(i=>String(i).toLowerCase()));

  const myCity=String(userProfile?.city||digitalProfile?.currentCity||'').trim().toLowerCase();
  const myLooking = String(userProfile?.lookingFor || digitalProfile?.lookingFor || discoveryFilters.interest || '').toLowerCase();
  const myIntents = Array.isArray(userProfile?.intents) ? userProfile.intents.map((i) => String(i).toLowerCase()) : [];
  const out = pool
    .filter(u => {
      if (!isDiscoveryEligibleUser(u)) return false;
      if(!u||!u.uid||dismissedUids.has(u.uid)||u.openToMeet===false) return false;
      if(discoveryFilters.sameCity&&myCity&&String(u.city||u.profile?.currentCity||'').trim().toLowerCase()!==myCity) return false;
      if(discoveryFilters.recentlyJoined&&!isRecentlyJoined(u)) return false;
      if(discoveryFilters.interest&&discoveryFilters.interest!=='any'){
        const wanted=discoveryFilters.interest.toLowerCase();
        const theirs=[...(u.interests||[]),...(u.profile?.interests||[]),u.topCat].filter(Boolean).map(i=>String(i).toLowerCase());
        if(!theirs.some(i=>i===wanted||i.includes(wanted)||wanted.includes(i))) return false;
      }
      return true;
    })
    .map(u=>{
      const their = [...(u.interests||[]),...(u.profile?.interests||[]), u.topCat].filter(Boolean).map(i=>String(i).toLowerCase());
      const shared = their.filter(i => [...myInterests].some(m => m.includes(i) || i.includes(m)));
      // Deterministic score — no Math.random fake precision (K0)
      let score = 48 + shared.length * 12;
      if(u.city && (userProfile?.city||digitalProfile?.currentCity||'').toLowerCase().includes(String(u.city).toLowerCase())) score += 15;
      const theirLooking = String(u.lookingFor || u.profile?.lookingFor || '').toLowerCase();
      const reasons = [];
      if (myLooking.includes('dat') || myLooking.includes('relationship') || myIntents.some((i) => i.includes('dat'))) {
        if (theirLooking.includes('dat') || theirLooking.includes('relationship')) { score += 18; reasons.push(t('discovery.both_open_to_dating')); }
        if (u.age && userProfile?.age && Math.abs(Number(u.age) - Number(userProfile.age)) <= 6) { score += 10; reasons.push(t('discovery.similar_age')); }
      } else if (myLooking.includes('friend') || myIntents.some((i) => i.includes('friend'))) {
        if (shared.length) { score += 10; reasons.push(`Shared: ${shared[0]}`); }
        reasons.push(t('discovery.looking_for_friendship'));
      } else if (myLooking.includes('network') || myLooking.includes('professional') || myIntents.some((i) => i.includes('recruit') || i.includes('career'))) {
        if (u.occupation || u.profile?.occupation) { score += 14; reasons.push(t('discovery.career_networking')); }
        if (u.city && myCity && String(u.city).toLowerCase() === myCity) { score += 8; reasons.push(t('discovery.same_city')); }
      } else {
        // Empty-query friendship-first default
        if (shared.length) reasons.push(`Shared: ${shared[0]}`);
        else reasons.push(t('discovery.open_to_meet'));
      }
      shared.slice(0, 2).forEach((s) => {
        const label = s.charAt(0).toUpperCase() + s.slice(1);
        if (!reasons.includes(label) && !reasons.some((r) => r.includes(label))) reasons.push(label);
      });
      if (!reasons.length && (u.interests || []).length) reasons.push(...(u.interests || []).slice(0, 2));
      if (u.isSample) reasons.unshift('Sample');
      return {
        user:{...u,_isNew:isRecentlyJoined(u), isSample: !!u.isSample},
        score,
        reasons: reasons.slice(0, 3),
        reason: reasons[0]
          ? reasons.slice(0, 2).join(' · ')
          : shared.length
            ? t('discovery.you_both_care_about', { list: (typeof formatList === 'function' ? formatList(shared.slice(0,2).map((x) => optionLabel('akhbaar.cat', x))) : shared.slice(0,2).map((x) => optionLabel('akhbaar.cat', x)).join(', ')) })
            : (u.bio || t('discovery.someone_you_might_enjoy_talking_to')),
        isSample: !!u.isSample,
      };
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
  if (typeof enrichUsersWithProfileType === 'function') {
    await enrichUsersWithProfileType(out.map((p) => p.user).filter(Boolean));
  }
  return out;
}

function renderDiscoverySection(profiles){
  const el = document.createElement('div');
  el.className = 'peepal-discovery';
  el.id = 'peepalDiscovery';
  if(!profiles || !profiles.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(el, {
        icon:'🌳',
        title:t('discovery.no_people_to_meet_right_now'),
        message:t('discovery.invite_a_friend_we_never_invent'),
        actionLabel: t('common.invite'),
        onAction: () => {
          if (typeof ChaupaalReferrals?.openInviteToChaupaalShare === 'function') {
            ChaupaalReferrals.openInviteToChaupaalShare();
          } else if (typeof shareInviteToChaupaal === 'function') {
            shareInviteToChaupaal();
          }
        },
      });
    } else {
      el.innerHTML = `<div class="discovery-loading">${tHtml('discovery.no_people_suggestions_invite_a_friend')}</div>`;
    }
    return el;
  }
  el.innerHTML = `
    <div class="discovery-ai-label">${tHtml('discovery.people_to_meet')}</div>
    <div class="peepal-discovery-header">
      <div>
        <div class="peepal-discovery-title">${tHtml('discovery.you_might_enjoy_talking_to')}</div>
        <div class="peepal-discovery-subtitle">${tHtml('discovery.based_on_your_profile_what_you')}</div>
      </div>
      <button class="peepal-undo-btn" id="discoveryUndoBtn" ${discoveryPreviousSet.length?'':'disabled'}>${tHtml('discovery.undo')}</button>
    </div>
    <div class="discovery-filters" aria-label="${tHtml('discovery.discovery_filters')}">
      <select data-discovery-filter="matchIntent" aria-label="${tHtml('discovery.match_intent')}">
        <option value="">${tHtml('discovery.intent_profile_default')}</option>
        ${PEEPAL_MATCH_INTENTS.map((i) => `<option value="${i}" ${discoveryFilters.matchIntent === i ? 'selected' : ''}>${optionLabelHtml('intent', i)}</option>`).join('')}
        <option value="__custom__" ${discoveryFilters.matchIntent && !PEEPAL_MATCH_INTENTS.includes(discoveryFilters.matchIntent) ? 'selected' : ''}>${tHtml('discovery.something_else')}</option>
      </select>
      <select data-discovery-filter="interest" aria-label="${tHtml('discovery.filter_by_interest')}">
        <option value="any">${tHtml('discovery.all_interests')}</option>
        ${/* i18n-values: akhbaar.cat */ ['Sports','Tech','Business','Music','Food','Travel','Movies','GK','India','World'].map(i=>`<option value="${i}" ${discoveryFilters.interest===i?'selected':''}>${optionLabelHtml('akhbaar.cat', i)}</option>`).join('')}
      </select>
      <label><input type="checkbox" data-discovery-filter="sameCity" ${discoveryFilters.sameCity?'checked':''}> ${tHtml('discovery.same_city')}</label>
      <label><input type="checkbox" data-discovery-filter="recentlyJoined" ${discoveryFilters.recentlyJoined?'checked':''}> ${tHtml('discovery.new_here')}</label>
    </div>
    <div class="discovery-cards">
      ${profiles.map(({user, reasons, reason})=>{
        const sharedTags = (reasons||[]).map(r=>String(r).replace(/^📌\s*/,''));
        const ib = typeof craftSpecificIcebreaker==='function'
          ? craftSpecificIcebreaker(user, { shared: sharedTags, reason })
          : (typeof pickIcebreakerSnippet==='function'
            ? pickIcebreakerSnippet(typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):user.icebreakers)
            : null);
        const ibJson = encodeURIComponent(JSON.stringify(
          typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):(user.icebreakers||[])
        ));
        return `
        <div class="discovery-card${user.profileTheme?.accent ? ' dp-themed cp-author-accent' : ''}${user.isSample ? ' discovery-card--sample' : ''}" data-uid="${user.uid}"${user.profileTheme?.accent ? ` style="--dp-accent:${user.profileTheme.accent}"` : ''}>
          <div class="discovery-card-top">
            <div class="discovery-avatar-wrap">
              <div class="discovery-avatar">${user.photoURL?`<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:user.avatar||'👤'}</div>
            </div>
            <div class="discovery-info">
              <div class="discovery-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(user.name,user):user.name}${user.isSample?' <span class="cp-demo-badge">' + tHtml('discovery.sample') + '</span>':''}</div>
              <div class="discovery-meta">${[user.city,user.age?user.age+'y':'',user.personality||''].filter(Boolean).join(' · ')}${user._isNew?' · <span class="discovery-new-badge">' + tHtml('discovery.new_here') + '</span>':''}</div>
            </div>
            <button class="discovery-dismiss" data-uid="${user.uid}" title="${tHtml('common.not_interested')}">✕</button>
          </div>
          ${(reasons||[]).length?`<div class="discovery-shared">${reasons.slice(0,4).map(r=>`<span class="discovery-shared-tag">${String(r)==='Sample'?tHtml('discovery.sample'):String(r).startsWith('📌')?escCompat(r):`📌 ${escCompat(optionLabel('akhbaar.cat', r))}`}</span>`).join('')}</div>`:''}
          <div class="discovery-reason">"${(typeof interestOverlapReason==='function' && interestOverlapReason(user)) || reason||tHtml('discovery.shared_interests_on_chaupaal')}"</div>
          <div class="discovery-transparency" style="font-size:11px;color:var(--muted);margin:4px 0 8px;">${tHtml('discovery.why_this_pick', { reasons: (reasons||[]).slice(0,2).map((r) => (String(r) === 'Sample' ? t('discovery.sample') : optionLabel('akhbaar.cat', r))).join(' · ') || t('discovery.profile_overlap') })}</div>
          ${ib?`<div class="discovery-icebreaker"><div class="discovery-icebreaker-label">${tHtml('discovery.conversation_starter')}</div><div class="discovery-icebreaker-text">"${ib.line || ib.answer}"</div></div>`:''}
          <div class="discovery-actions">
            <button class="discovery-view-btn" data-uid="${user.uid}">${tHtml('discovery.view_profile')}</button>
            <button class="discovery-friend-btn" data-friend-uid="${user.uid}">${tHtml('common.add_friend')}</button>
          </div>
          <button class="discovery-nudge-btn discovery-nudge-btn--secondary" data-uid="${user.uid}" data-name="${user.name}" data-avatar="${user.avatar||'👤'}" data-icebreakers="${ibJson}" data-starter="${encodeURIComponent(ib?.line || ib?.answer || '')}">💬 ${ib?.cta || tHtml('discovery.ask_about_their_prompt')}</button>
        </div>`;
      }).join('')}
    </div>
  `;

  el.querySelectorAll('.discovery-dismiss').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const uid=btn.dataset.uid;
      const card=btn.closest('.discovery-card');
      if (discoveryImpressionTimers[uid]) {
        clearTimeout(discoveryImpressionTimers[uid]);
        delete discoveryImpressionTimers[uid];
      }
      logDiscoveryEngagement(uid, 'rejected');
      dismissedUids.add(uid);
      try{localStorage.setItem('chaupaal_dismissed_uids',JSON.stringify([...dismissedUids]));}catch(err){}
      if(card){
        card.classList.add('discovery-card--exit');
        setTimeout(()=>{
          card.remove();
          if(typeof showToast==='function') showToast(t('discovery.got_it_fewer_like_this'));
        },280);
      } else if(typeof showToast==='function') showToast(t('discovery.got_it_fewer_like_this'));
    });
  });

  el.querySelectorAll('[data-discovery-filter]').forEach(control=>{
    control.addEventListener('change',async()=>{
      const key=control.dataset.discoveryFilter;
      if (key === 'matchIntent' && control.value === '__custom__') {
        const typed = typeof promptNameSheet === 'function'
          ? await promptNameSheet({ title: t('discovery.match_intent'), placeholder: t('discovery.what_are_you_looking_for'), confirmLabel: t('discovery.use') })
          : window.prompt(t('discovery.what_are_you_looking_for'));
        if (!typed) return;
        discoveryFilters.matchIntent = String(typed).trim().slice(0, 80);
      } else {
        discoveryFilters[key]=control.type==='checkbox'?control.checked:control.value;
      }
      saveDiscoveryFilters();
      const feed=document.getElementById('peepalFeed');
      const current=document.getElementById('peepalDiscovery');
      if(!feed?.parentElement||!current) return;
      if(typeof renderSkeleton==='function') renderSkeleton(current,{variant:'card',count:2});
      const next=await getDiscoveryProfiles();
      discoveryPreviousSet=[...discoveryCurrentSet];
      discoveryCurrentSet=next;
      current.replaceWith(renderDiscoverySection(next));
    });
  });

  el.querySelectorAll('.discovery-view-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const match=profiles.find(p=>p.user?.uid===btn.dataset.uid);
      if(match?.user&&typeof openPublicProfile==='function'){
        openPublicProfile(match.user,{uid:match.user.uid,username:match.user.username,context:'peepal'});
      }else if(typeof showToast==='function') showToast(t('common.profile_unavailable'));
    });
  });

  el.querySelectorAll('[data-friend-uid]').forEach(btn=>{
    btn.addEventListener('click', () => {
      const uid = btn.dataset.friendUid;
      if (discoveryImpressionTimers[uid]) {
        clearTimeout(discoveryImpressionTimers[uid]);
        delete discoveryImpressionTimers[uid];
      }
      logDiscoveryEngagement(uid, 'accepted');
    }, { capture: true });
    if(typeof wireFriendAction==='function') wireFriendAction(btn,btn.dataset.friendUid);
  });

  el.querySelectorAll('.discovery-avatar').forEach(avatar=>{
    const card=avatar.closest('.discovery-card');
    const match=profiles.find(p=>p.user?.uid===card?.dataset.uid);
    if(!match?.user) return;
    if(typeof wireIdentityTaps==='function'){
      wireIdentityTaps(card,match.user,{
        avatarSel:'.discovery-avatar',
        nameSel:'.discovery-name',
        context:'peepal',
      });
    } else if(typeof bindProfileLongPress==='function'){
      bindProfileLongPress(avatar,match.user);
    }
  });

  el.querySelectorAll('.discovery-nudge-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name=btn.dataset.name;
      const avatar=btn.dataset.avatar;
      const uid=btn.dataset.uid;
      if (discoveryImpressionTimers[uid]) {
        clearTimeout(discoveryImpressionTimers[uid]);
        delete discoveryImpressionTimers[uid];
      }
      logDiscoveryEngagement(uid, 'accepted');
      let theirIcebreakers=[];
      try{ theirIcebreakers=JSON.parse(decodeURIComponent(btn.dataset.icebreakers||'%5B%5D')); }catch(e){}
      if(typeof openDmWithSharedHello==='function'){
        openDmWithSharedHello({
          uid,
          name,
          avatar,
          theirIcebreakers,
          starterText: (()=>{ try{ return decodeURIComponent(btn.dataset.starter||''); }catch(e){ return ''; } })() || undefined,
          origin: 'peepal_discovery',
          peerProfileType: (profiles.find((p) => p.user?.uid === uid)?.user?.profileType) || 'personal',
        });
        return;
      }
      if(typeof showToast==='function') showToast(t('discovery.could_not_open_chat_try_again'));
    });
  });

  el.querySelector('#discoveryUndoBtn')?.addEventListener('click',()=>{
    if(!discoveryPreviousSet.length)return;
    const feed=document.getElementById('peepalFeed');
    document.getElementById('peepalDiscovery')?.remove();
    discoveryCurrentSet=[...discoveryPreviousSet];
    if(feed?.parentElement){
      const section=renderDiscoverySection(discoveryCurrentSet);
      section.querySelectorAll('.discovery-card').forEach((c,i)=>{
        c.classList.add('discovery-card--enter');
        c.style.animationDelay=`${i*40}ms`;
      });
      feed.parentElement.insertBefore(section,feed);
    }
  });

  return el;
}

/** Intent lean for mix rules — friendship-majority surfaces. */
function detectIntentLean(user) {
  const blob = [
    user?.lookingFor,
    user?.matchIntent,
    user?.profile?.lookingFor,
    ...(Array.isArray(user?.intents) ? user.intents : []),
    ...(Array.isArray(user?.profile?.intents) ? user.profile.intents : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/dat|romance|marriage|relationship/.test(blob)) return 'dating';
  if (/job|hir|career|co-?founder|network|mentor|recruit/.test(blob)) return 'career';
  if (/flat|room|travel|game|music/.test(blob)) return 'other';
  if (/friend|buddy|hang/.test(blob)) return 'friendship';
  return 'friendship'; // default lean — Chaupaal is friendship-majority
}

function viewerCompatSignals() {
  const gender = String(
    userProfile?.gender || digitalProfile?.gender || ''
  )
    .trim()
    .toLowerCase();
  const age = Number(userProfile?.age || digitalProfile?.age || 0) || null;
  const opposite =
    gender === 'male' || gender === 'm' || gender === 'man'
      ? 'female'
      : gender === 'female' || gender === 'f' || gender === 'woman'
        ? 'male'
        : null;
  const interests = new Set(
    [
      ...(personalityProfile?.interests || []),
      ...(typeof digitalProfile !== 'undefined' && digitalProfile?.interests ? digitalProfile.interests : []),
      ...(myCategories || []).map((c) => c.name),
    ]
      .filter(Boolean)
      .map((i) => String(i).toLowerCase())
  );
  return { gender, age, opposite, interests };
}

function isDiscoveryEligibleUser(user) {
  if (!user?.uid) return false;
  if (typeof currentUser !== 'undefined' && currentUser?.uid && user.uid === currentUser.uid) return false;
  if (typeof dismissedUids !== 'undefined' && dismissedUids?.has?.(user.uid)) return false;
  try {
    if (typeof getBlockedSet === 'function' && getBlockedSet().has(user.uid)) return false;
  } catch (e) {}
  try {
    const blocked = JSON.parse(localStorage.getItem('chaupaal_dismissed_uids') || '[]');
    if (Array.isArray(blocked) && blocked.includes(user.uid)) return false;
  } catch (e) {}
  // K0: strangers only — never surface friends / pending requests as "people to meet"
  try {
    if (typeof relationshipState === 'function') {
      const st = relationshipState(user.uid);
      if (st?.friend || st?.requestSent || st?.requestReceived) return false;
    }
  } catch (e) {}
  if (user.hiddenFromDiscovery || user.openToMeet === false) return false;
  if (typeof isBlockedAge === 'function' && user.age != null && isBlockedAge(Number(user.age))) return false;
  if (typeof isTeenModeUser === 'function' && isTeenModeUser() && detectIntentLean(user) === 'dating') return false;
  return true;
}

/**
 * Specific icebreaker line — prefer profile prompt answer, then shared interest, else a light generated line.
 * Never invents people; only crafts text from real profile fields.
 */
function craftSpecificIcebreaker(user, opts) {
  const o = opts || {};
  const their =
    typeof resolveIcebreakersFromUser === 'function'
      ? resolveIcebreakersFromUser(user)
      : user?.icebreakers || user?.profile?.icebreakers || [];
  const snippet =
    typeof pickIcebreakerSnippet === 'function' ? pickIcebreakerSnippet(their) : their?.[0] || null;
  if (snippet?.answer) {
    const promptText =
      snippet.question ||
      (typeof getIcebreakerPromptById === 'function' && snippet.promptId
        ? getIcebreakerPromptById(snippet.promptId)?.text
        : null) ||
      '';
    const shortQ = promptText
      ? promptText.length > 48
        ? promptText.slice(0, 46) + '…'
        : promptText
      : '';
    const line = shortQ
      ? t('discovery.ask_about_shortq_they_said_answer', { shortQ, answer: snippet.answer })
      : t('discovery.ask_them_about_answer', { answer: snippet.answer });
    return {
      ...snippet,
      line,
      cta: shortQ ? t('discovery.ask_prompt', { prompt: shortQ.slice(0, 28) + (shortQ.length > 28 ? '…' : '') }) : t('discovery.ask_about_their_prompt'),
      source: 'prompt',
    };
  }
  const shared = (o.shared || []).map((s) => String(s).replace(/^📌\s*/, '')).filter(Boolean);
  const interest =
    shared.find((s) => !/similar age|same city|friendship|dating|career|compatibility/i.test(s)) ||
    (user?.interests || [])[0];
  if (interest) {
    const label = String(interest).charAt(0).toUpperCase() + String(interest).slice(1);
    return {
      answer: label,
      line: t('discovery.you_both_light_up_around_label', { label }),
      cta: t('discovery.ask_about_label', { label }),
      source: 'shared',
    };
  }
  if (user?.bio && String(user.bio).trim().length > 8) {
    const bio = String(user.bio).trim();
    const clip = bio.length > 64 ? bio.slice(0, 62) + '…' : bio;
    return {
      answer: clip,
      line: t('discovery.open_with_their_bio_clip', { clip }),
      cta: t('discovery.ask_about_their_bio'),
      source: 'bio',
    };
  }
  if (user?.city) {
    return {
      answer: user.city,
      line: t('discovery.ask_what_they_d_show_a', { city: user.city }),
      cta: t('discovery.ask_about_city', { city: user.city }),
      source: 'city',
    };
  }
  return null;
}

/**
 * Re-rank matches: friendship-majority mix; opposite-gender + similar-age dominate; light other mix OK.
 */
function rankCompatibilityPeeks(profiles, opts) {
  const o = opts || {};
  const signals = viewerCompatSignals();
  const friendshipMajority = o.friendshipMajority !== false;
  const scored = (profiles || [])
    .filter((p) => isDiscoveryEligibleUser(p?.user || p))
    .map((p) => {
      const user = p.user || p;
      const base = Number(p.score || p.matchPct || 50);
      let score = base;
      const lean = detectIntentLean(user);
      const theirGender = String(user.gender || user.profile?.gender || '')
        .trim()
        .toLowerCase();
      const theirAge = Number(user.age || user.profile?.age || 0) || null;
      if (friendshipMajority) {
        if (lean === 'friendship') score += 22;
        else if (lean === 'dating') score += 4;
        else if (lean === 'career') score += 8;
        else score += 10;
      }
      if (signals.opposite && theirGender) {
        const norm =
          theirGender === 'm' || theirGender === 'man'
            ? 'male'
            : theirGender === 'f' || theirGender === 'woman'
              ? 'female'
              : theirGender;
        if (norm === signals.opposite) score += 18;
        else if (norm === signals.gender) score -= 4;
      }
      if (signals.age && theirAge) {
        const delta = Math.abs(signals.age - theirAge);
        if (delta <= 3) score += 16;
        else if (delta <= 6) score += 10;
        else if (delta <= 10) score += 4;
        else score -= 6;
      }
      const theirInterests = [...(user.interests || []), ...(user.profile?.interests || [])]
        .filter(Boolean)
        .map((i) => String(i).toLowerCase());
      const shared = theirInterests.filter((i) =>
        [...signals.interests].some((m) => m.includes(i) || i.includes(m))
      );
      score += Math.min(24, shared.length * 8);
      const ice = craftSpecificIcebreaker(user, { shared, reason: p.reason });
      return {
        ...p,
        user,
        lean,
        score,
        shared,
        icebreaker: ice,
        reasons: (p.reasons && p.reasons.length ? p.reasons : shared.slice(0, 2).map((s) => String(s).charAt(0).toUpperCase() + String(s).slice(1))).slice(0, 3),
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!friendshipMajority || scored.length <= 3) return scored;

  // Soft mix: keep ~60%+ friendship-leaning in the visible window without inventing users
  const friends = scored.filter((p) => p.lean === 'friendship');
  const others = scored.filter((p) => p.lean !== 'friendship');
  const out = [];
  let fi = 0;
  let oi = 0;
  while (out.length < scored.length && (fi < friends.length || oi < others.length)) {
    const preferFriend = out.filter((x) => x.lean === 'friendship').length <= out.length * 0.6;
    if (preferFriend && fi < friends.length) out.push(friends[fi++]);
    else if (oi < others.length) out.push(others[oi++]);
    else if (fi < friends.length) out.push(friends[fi++]);
    else break;
  }
  return out;
}

let _compatPeekCache = [];
let _compatPeekCursor = 0;

/**
 * Eligible stranger pool (friends / pending dropped by isDiscoveryEligibleUser).
 * Temporarily steers discoveryFilters.matchIntent, then restores it.
 */
async function fetchCompatStrangerPool({ intentOverride = null } = {}) {
  const prevIntent = discoveryFilters.matchIntent;
  if (intentOverride) discoveryFilters.matchIntent = intentOverride;
  let raw = [];
  try {
    raw = typeof getDiscoveryProfiles === 'function' ? await getDiscoveryProfiles() : [];
  } catch (e) {
    raw = [];
  }
  try {
    if (typeof hydrateRelationships === 'function' && raw.length) {
      await hydrateRelationships(raw.map((p) => p.user?.uid || p.uid).filter(Boolean));
      raw = raw.filter((p) => isDiscoveryEligibleUser(p.user || p));
    }
  } catch (e) {}
  if (intentOverride) discoveryFilters.matchIntent = prevIntent;
  // Guest-only labeled samples — never pad signed-in discovery with invented people.
  if (
    raw.length < 8 &&
    !(typeof currentUser !== 'undefined' && currentUser) &&
    typeof SAMPLE_DISCOVERY_POOL !== 'undefined'
  ) {
    const extra = SAMPLE_DISCOVERY_POOL.filter((u) => isDiscoveryEligibleUser(u)).map((u) => ({
      user: { ...u, isSample: true },
      score: 50,
      reasons: ['Sample', ...((u.interests || []).slice(0, 1))], // i18n-ignore (brand name / code)
      reason: t('discovery.sample_sign_in_for_real_people'),
      isSample: true,
    }));
    const seen = new Set(raw.map((p) => p.user?.uid));
    extra.forEach((p) => {
      if (p.user?.uid && !seen.has(p.user.uid)) {
        seen.add(p.user.uid);
        raw.push(p);
      }
    });
  }
  return raw;
}

/** Uids Khoj has rendered this session — Vriksha picks avoid repeating them. */
const _khojShownUids = new Set();
function noteKhojShownUids(peeks) {
  (peeks || []).forEach((p) => {
    const uid = p?.user?.uid;
    if (uid) _khojShownUids.add(uid);
  });
}

let _vrikshaPicksCache = [];

/**
 * Vriksha "people you might befriend" strip — strangers only, friendship lean,
 * separate cache from Khoj so neither list resets the other.
 */
async function getVrikshaFriendPicks(opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(12, Number(o.limit) || 6));
  if (o.reset || !_vrikshaPicksCache.length) {
    const raw = await fetchCompatStrangerPool({ intentOverride: 'Friendship' });
    _vrikshaPicksCache = rankCompatibilityPeeks(raw, { friendshipMajority: true }).filter(
      (p) => p.lean !== 'dating' && p.lean !== 'career'
    );
  }
  const fresh = _vrikshaPicksCache.filter((p) => !_khojShownUids.has(p.user?.uid));
  const pool = fresh.length >= Math.min(3, limit) ? fresh : _vrikshaPicksCache;
  const friendsFirst = pool
    .filter((p) => p.lean === 'friendship')
    .concat(pool.filter((p) => p.lean !== 'friendship'));
  return { peeks: friendsFirst.slice(0, limit), total: friendsFirst.length };
}

async function getCompatibilityPeeks(opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(20, Number(o.limit) || 3));
  const reset = !!o.reset;
  const friendshipOnly = !!o.friendshipOnly;
  const networkingDefault = !!o.networkingDefault || isViewerProfessional();
  if (reset || !_compatPeekCache.length) {
    let intentOverride = null;
    if (networkingDefault && !friendshipOnly) {
      intentOverride = discoveryFilters.matchIntent || 'Networking / Professional connections'; // i18n-ignore (intent code)
    } else if (friendshipOnly || o.emptyFriendship) {
      intentOverride = 'Friendship';
    }
    const raw = await fetchCompatStrangerPool({ intentOverride });
    _compatPeekCache = rankCompatibilityPeeks(raw, {
      friendshipMajority: networkingDefault ? false : o.friendshipMajority !== false,
    });
    if (!networkingDefault && (friendshipOnly || o.emptyFriendship)) {
      const friends = _compatPeekCache.filter((p) => p.lean === 'friendship');
      if (friends.length) _compatPeekCache = friends.concat(_compatPeekCache.filter((p) => p.lean !== 'friendship'));
    }
    _compatPeekCursor = 0;
  }
  const offset = o.offset != null ? Number(o.offset) : _compatPeekCursor;
  const slice = _compatPeekCache.slice(offset, offset + limit);
  _compatPeekCursor = offset + slice.length;
  return {
    peeks: slice,
    hasMore: _compatPeekCursor < _compatPeekCache.length,
    cursor: _compatPeekCursor,
    total: _compatPeekCache.length,
  };
}

function escCompat(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * "Because you…" lines. The ranking server (and cached results) send English phrases; known ones
 * are read in the viewer's language, anything else shows as sent.
 */
const DISCOVERY_WHY_FIXED = {
  'matched on open profile': 'discovery.matched_on_open_profile',
  'also open to hiring': 'discovery.why.open_to_hiring',
  professional: 'discovery.why.professional',
  'both active recently': 'discovery.why.active_recently',
  'same city': 'discovery.why.same_city',
  nearby: 'discovery.why.nearby',
  'similar to people you liked': 'discovery.why.similar_people',
  'new on chaupaal': 'discovery.why.new_member',
  'topic overlap with your interests': 'discovery.why.topic_overlap',
  'already follows you': 'discovery.why.follows_you',
  'likely mutual interest': 'discovery.why.mutual_interest',
};
const DISCOVERY_WHY_BITS = {
  city: 'discovery.why.bit_city',
  college: 'discovery.why.bit_college',
  interests: 'discovery.why.bit_interests',
  preferences: 'discovery.why.bit_preferences',
  'shared connections': 'discovery.why.bit_shared_connections',
  intent: 'discovery.why.bit_intent',
};

function discoveryWhyPhrase(raw) {
  const s = String(raw || '').trim();
  const low = s.toLowerCase();
  if (DISCOVERY_WHY_FIXED[low]) return t(DISCOVERY_WHY_FIXED[low]);
  let m = /^same industry · (.+)$/i.exec(s);
  if (m) return t('discovery.why.same_industry', { industry: optionLabel('industry', m[1]) });
  m = /^shared interest: (.+)$/i.exec(s);
  if (m) return t('discovery.why.shared_interest', { interest: optionLabel('akhbaar.cat', m[1]) });
  m = /^matched on (.+)$/i.exec(s);
  if (m) {
    const bits = m[1].split(/\s*&\s*/).map((b) => (DISCOVERY_WHY_BITS[b.toLowerCase()] ? t(DISCOVERY_WHY_BITS[b.toLowerCase()]) : optionLabel('akhbaar.cat', b)));
    return t('discovery.matched_on_list', { list: typeof formatList === 'function' ? formatList(bits) : bits.join(', ') });
  }
  return optionLabel('purpose', s);
}

/** explain (string | string[]) → one display line in the viewer's language. */
function discoveryExplainText(explain) {
  const list = Array.isArray(explain) ? explain : explain ? [explain] : [];
  const parts = [];
  list.forEach((item) => {
    const s = String(item || '').trim();
    if (!s) return;
    // explainMatch joins up to two human phrases with " · " ("Same industry · Tech · Hiring").
    const segs = s.split(' · ');
    for (let i = 0; i < segs.length; i++) {
      if (/^same industry$/i.test(segs[i]) && segs[i + 1]) {
        parts.push(discoveryWhyPhrase(segs[i] + ' · ' + segs[i + 1]));
        i++;
      } else parts.push(discoveryWhyPhrase(segs[i]));
    }
  });
  return parts.length ? parts.slice(0, 4).join(' · ') : t('discovery.matched_on_open_profile');
}
window.discoveryExplainText = discoveryExplainText;

function renderCompatPeekCard(peek) {
  const user = peek.user || {};
  const ice = peek.icebreaker || craftSpecificIcebreaker(user, { shared: peek.shared || peek.reasons });
  const ibJson = encodeURIComponent(
    JSON.stringify(
      typeof resolveIcebreakersFromUser === 'function'
        ? resolveIcebreakersFromUser(user)
        : user.icebreakers || []
    )
  );
  const starter = encodeURIComponent(ice?.line || ice?.answer || '');
  const nameHtml =
    typeof formatDisplayNameHtml === 'function'
      ? formatDisplayNameHtml(user.name, user)
      : escCompat(user.name || t('common.someone'));
  const why = (peek.reasons || []).slice(0, 2).map((r) => (String(r) === 'Sample' ? t('discovery.sample') : optionLabel('akhbaar.cat', r))).join(' · ') || peek.reason || '';
  return `
    <article class="peepal-compat-peek${user.isSample || peek.isSample ? ' peepal-compat-peek--sample' : ''}" data-uid="${escCompat(user.uid)}">
      <div class="peepal-compat-peek-avatar">${
        user.photoURL
          ? `<img src="${escCompat(user.photoURL)}" alt="">`
          : escCompat(user.avatar || '👤')
      }</div>
      <div class="peepal-compat-peek-body">
        <div class="peepal-compat-peek-name">${nameHtml}${user.isSample || peek.isSample ? ' <span class="cp-demo-badge">' + tHtml('discovery.sample') + '</span>' : ''}</div>
        <div class="peepal-compat-peek-meta">${[user.city, user.age ? t('discovery.age_short', { age: user.age }) : '', peek.lean === 'friendship' ? t('discovery.friendship') : '']
          .filter(Boolean)
          .map(escCompat)
          .join(' · ')}</div>
        ${why ? `<div class="peepal-compat-peek-why">${escCompat(why)}</div>` : ''}
        ${
          ice
            ? `<div class="peepal-compat-peek-ice"><strong>${tHtml('discovery.icebreaker')}</strong>${escCompat(ice.line || ice.answer)}</div>`
            : ''
        }
        <div class="peepal-compat-peek-actions">
          <button type="button" class="peepal-compat-peek-view" data-uid="${escCompat(user.uid)}">${tHtml('common.profile')}</button>
          <button type="button" class="peepal-compat-peek-chat" data-uid="${escCompat(user.uid)}" data-name="${escCompat(user.name || '')}" data-avatar="${escCompat(user.avatar || '👤')}" data-icebreakers="${ibJson}" data-starter="${starter}">${escCompat(ice?.cta || t('discovery.ask_them'))}</button>
        </div>
      </div>
    </article>`;
}

function wireCompatPeekHost(host, peeks) {
  if (!host) return;
  host.querySelectorAll('.peepal-compat-peek').forEach((card) => {
    const match = (peeks || []).find((p) => p.user?.uid === card.dataset.uid);
    if (match?.user && typeof wireIdentityTaps === 'function') {
      wireIdentityTaps(card, match.user, {
        avatarSel: '.peepal-compat-peek-avatar',
        nameSel: '.peepal-compat-peek-name',
        context: 'peepal',
      });
    }
  });
  host.querySelectorAll('.peepal-compat-peek-view').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const match = (peeks || []).find((p) => p.user?.uid === btn.dataset.uid);
      if (match?.user && typeof tapAvatarFromFeed === 'function') {
        tapAvatarFromFeed(match.user, { context: 'peepal' });
      } else if (match?.user && typeof openPublicProfile === 'function') {
        openPublicProfile(match.user, { uid: match.user.uid, username: match.user.username, context: 'peepal' });
      }
    });
  });
  host.querySelectorAll('.peepal-compat-peek-chat').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const match = (peeks || []).find((p) => p.user?.uid === uid);
      let theirIcebreakers = [];
      try {
        theirIcebreakers = JSON.parse(decodeURIComponent(btn.dataset.icebreakers || '%5B%5D'));
      } catch (err) {}
      let starterText = '';
      try {
        starterText = decodeURIComponent(btn.dataset.starter || '');
      } catch (err) {}
      if (typeof openDmWithSharedHello === 'function') {
        openDmWithSharedHello({
          uid,
          name: btn.dataset.name,
          avatar: btn.dataset.avatar,
          theirIcebreakers,
          starterText: starterText || undefined,
          origin: 'compat_peek',
          peerProfileType: match?.user?.profileType || 'personal',
        });
      } else if (typeof showToast === 'function') {
        showToast(starterText || t('discovery.open_chat_from_baithak'));
      }
    });
  });
}

async function mountCompatPeeks(host, opts) {
  if (!host) return [];
  const o = opts || {};
  host.innerHTML = `<div class="discovery-loading" style="padding:8px;font-size:12px;">${tHtml('discovery.finding_compatible_people')}</div>`;
  try {
    const { peeks } = await getCompatibilityPeeks({
      limit: o.limit || 3,
      reset: o.reset !== false,
      friendshipOnly: !!o.friendshipOnly,
      emptyFriendship: !!o.emptyFriendship,
      friendshipMajority: o.friendshipMajority !== false,
    });
    if (!peeks.length) {
      host.innerHTML = `<div class="khoj-compat-empty">${tHtml('discovery.no_eligible_people_to_suggest_right')}</div>`;
      return [];
    }
    host.innerHTML = peeks.map(renderCompatPeekCard).join('');
    wireCompatPeekHost(host, peeks);
    return peeks;
  } catch (e) {
    host.innerHTML = `<div class="khoj-compat-empty">${tHtml('discovery.couldn_t_load_peeks_try_again')}</div>`;
    return [];
  }
}

function tintPeepalIntentChips(root) {
  const scope = root || document;
  scope.querySelectorAll('.peepal-nudge-chip[data-tint], [data-khoj-chips] .peepal-nudge-chip').forEach((chip) => {
    const tint = chip.getAttribute('data-tint') || chip.dataset.tint;
    if (!tint) return;
    chip.style.setProperty('--chip-tint', tint);
    chip.classList.add('peepal-nudge-chip--tinted');
    if (chip.classList.contains('peepal-nudge-chip--mini')) return;
    const icon = chip.querySelector('[data-icon], .cp-icon, svg');
    if (icon) {
      icon.style.color = tint;
      icon.style.stroke = tint;
    }
  });
}

window.craftSpecificIcebreaker = craftSpecificIcebreaker;
window.rankCompatibilityPeeks = rankCompatibilityPeeks;
window.getCompatibilityPeeks = getCompatibilityPeeks;
window.getVrikshaFriendPicks = getVrikshaFriendPicks;
window.noteKhojShownUids = noteKhojShownUids;
window.mountCompatPeeks = mountCompatPeeks;
window.renderCompatPeekCard = renderCompatPeekCard;
window.wireCompatPeekHost = wireCompatPeekHost;
window.tintPeepalIntentChips = tintPeepalIntentChips;
window.isDiscoveryEligibleUser = isDiscoveryEligibleUser;
window.detectIntentLean = detectIntentLean;
window.saveDiscoveryFilters = saveDiscoveryFilters;
window.clearDiscoveryFilters = clearDiscoveryFilters;
window.getDiscoveryFilterPayload = getDiscoveryFilterPayload;
window.discoveryFiltersActiveCount = discoveryFiltersActiveCount;
window.renderKhojFiltersMarkup = renderKhojFiltersMarkup;
window.wireKhojFilters = wireKhojFilters;

