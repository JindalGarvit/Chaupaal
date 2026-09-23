// ===================== SAMPLE DISCOVERY POOL =====================
const SAMPLE_DISCOVERY_POOL = [
  {uid:'u_riya',name:'Riya Sharma',avatar:'😊',photoURL:null,city:'Mumbai',age:24,gender:'female',personality:'social',openToMeet:true,profileType:'personal',interests:['Sports','Tech','Music'],bio:'Cricket on weekends, startups on weekdays',questions:12,icebreakers:[{promptId:'ib14',answer:'Cutting chai, extra adrak — non-negotiable after the local.'}]},
  {uid:'u_arjun',name:'Arjun Mehta',avatar:'🏔️',photoURL:null,city:'Delhi',age:27,gender:'male',personality:'outdoorsy',openToMeet:true,profileType:'personal',interests:['Sports','Travel','World'],bio:'Always planning the next trek',questions:8,icebreakers:[{promptId:'ib18',answer:'Road trip — windows down, random dhabas, no timetable.'}]},
  {uid:'u_priya',name:'Priya Nair',avatar:'👩',photoURL:null,city:'Bengaluru',age:25,gender:'female',personality:'intellectual',openToMeet:true,profileType:'professional',interests:['Tech','Business','GK'],bio:'Product manager who loves quizzes',questions:20,icebreakers:[{promptId:'ib05',answer:'Filter coffee forever. Tea is lovely; coffee is a personality.'},{promptId:'ib15',answer:'Church Street walk, then that tiny dosa place before traffic wakes up.'}]},
  {uid:'u_dev',name:'Dev Sharma',avatar:'👨',photoURL:null,city:'Pune',age:29,gender:'male',personality:'intellectual',openToMeet:true,profileType:'personal',interests:['Business','World','GK'],bio:'Reading non-fiction and debating',questions:15,icebreakers:[{promptId:'ib10',answer:'A stranger returned my dropped metro card. Tiny, but it stuck.'}]},
  {uid:'u_ananya',name:'Ananya Iyer',avatar:'🎨',photoURL:null,city:'Chennai',age:23,gender:'female',personality:'cinephile',openToMeet:true,profileType:'personal',interests:['Movies','Music','Food'],bio:'Film festivals + filter coffee',questions:6,icebreakers:[{promptId:'ib16',answer:'Pongal — the kolam, the sugarcane, the slow morning with family.'}]},
  {uid:'u_kabir',name:'Kabir Singh',avatar:'🎮',photoURL:null,city:'Hyderabad',age:26,gender:'male',personality:'social',openToMeet:true,profileType:'personal',interests:['Tech','Sports','Music'],bio:'Gamer, coder, chai addict',questions:10,icebreakers:[{promptId:'ib14',answer:'Irani chai + Osmania biscuit. Hilltop debates optional.'}]},
  {uid:'u_meera',name:'Meera Kapoor',avatar:'📚',photoURL:null,city:'Jaipur',age:28,gender:'female',personality:'intellectual',openToMeet:true,profileType:'professional',interests:['GK','World','Travel'],bio:'History nerd who loves museums',questions:18,icebreakers:[{promptId:'ib17',answer:'"Khamma ghani" — say it once and the city softens.'}]},
  {uid:'u_rohan',name:'Rohan Kapoor',avatar:'👨‍💻',photoURL:null,city:'Mumbai',age:30,gender:'male',personality:'intellectual',openToMeet:true,profileType:'professional',interests:['Tech','Business','Sports'],bio:'Building something new',questions:9,icebreakers:[{promptId:'ib19',answer:'Pottery on weekends. Hands full of clay, brain finally quiet.'}]},
  {uid:'u_sneha',name:'Sneha Joshi',avatar:'🌱',photoURL:null,city:'Mumbai',age:22,gender:'female',personality:'outdoorsy',openToMeet:true,profileType:'personal',interests:['Travel','Food','World'],bio:'Looking for travel buddies',questions:5,icebreakers:[{promptId:'ib15',answer:'Sunset at Bandra bandstand, then whatever stall smells best.'}]},
  {uid:'u_vikram',name:'Vikram Rao',avatar:'🏏',photoURL:null,city:'Ahmedabad',age:31,gender:'male',personality:'social',openToMeet:true,profileType:'personal',interests:['Sports','Business','India'],bio:'IPL nights and chai debates',questions:14,icebreakers:[{promptId:'ib14',answer:'Cutting chai with extra sugar — fight me.'}]},
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

const PEEPAL_MATCH_INTENTS = [
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
    (i) => `<option value="${i}" ${f.matchIntent === i ? 'selected' : ''}>${i}</option>`
  ).join('');
  const interestOpts = ['Sports', 'Tech', 'Business', 'Music', 'Food', 'Travel', 'Movies', 'GK', 'India', 'World']
    .map((i) => `<option value="${i}" ${f.interest === i ? 'selected' : ''}>${i}</option>`)
    .join('');
  const customSel =
    f.matchIntent && !PEEPAL_MATCH_INTENTS.includes(f.matchIntent) ? 'selected' : '';
  const industries =
    (typeof ProfileTaxonomy !== 'undefined' && ProfileTaxonomy.INDUSTRIES) ||
    ['Technology', 'Finance', 'Healthcare', 'Education', 'Media & Entertainment', 'Consulting', 'Startup', 'Other'];
  const purposes =
    (typeof ProfileTaxonomy !== 'undefined' && ProfileTaxonomy.PURPOSES) ||
    ['Grow my network', 'Find collaborators', 'Hire talent', 'Find work', 'Learn from peers'];
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
        Filters${discoveryFiltersActiveCount() ? ` · ${discoveryFiltersActiveCount()}` : ''}
      </button>
      <button type="button" class="khoj-filters-clear${discoveryFiltersActiveCount() ? '' : ' hidden'}" id="khojFiltersClear" title="Clear filters">Clear</button>
    </div>
    <div class="khoj-filters-panel hidden" id="khojFiltersPanel" hidden>
      <label class="khoj-filter-field">
        <span>Intent</span>
        <select data-discovery-filter="matchIntent" aria-label="Match intent">
          <option value="">Profile default</option>
          ${intents}
          <option value="__custom__" ${customSel}>Something else…</option>
        </select>
      </label>
      <label class="khoj-filter-field">
        <span>Interest</span>
        <select data-discovery-filter="interest" aria-label="Filter by interest">
          <option value="any">All interests</option>
          ${interestOpts}
        </select>
      </label>
      ${
        showProFilters
          ? `<label class="khoj-filter-field">
        <span>Industry</span>
        <select data-discovery-filter="industry" aria-label="Industry">
          <option value="">Any industry</option>
          ${indOpts}
        </select>
      </label>
      <label class="khoj-filter-field">
        <span>Purpose</span>
        <select data-discovery-filter="purpose" aria-label="Purpose">
          <option value="">Any purpose</option>
          ${purOpts}
        </select>
      </label>`
          : ''
      }
      <label class="khoj-filter-check"><input type="checkbox" data-discovery-filter="sameCity" ${f.sameCity ? 'checked' : ''}> Same city</label>
      <label class="khoj-filter-check"><input type="checkbox" data-discovery-filter="recentlyJoined" ${f.recentlyJoined ? 'checked' : ''}> New here</label>
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
    if (toggle) toggle.textContent = n ? `Filters · ${n}` : 'Filters';
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
                title: 'Match intent',
                placeholder: 'What are you looking for?',
                confirmLabel: 'Use',
              })
            : window.prompt('What are you looking for?');
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
                ? 'Someone you might work with on Chaupaal'
                : 'Someone you might enjoy talking to on Peepal'),
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
        if (theirLooking.includes('dat') || theirLooking.includes('relationship')) { score += 18; reasons.push('Both open to dating'); }
        if (u.age && userProfile?.age && Math.abs(Number(u.age) - Number(userProfile.age)) <= 6) { score += 10; reasons.push('Similar age'); }
      } else if (myLooking.includes('friend') || myIntents.some((i) => i.includes('friend'))) {
        if (shared.length) { score += 10; reasons.push(`Shared: ${shared[0]}`); }
        reasons.push('Looking for friendship');
      } else if (myLooking.includes('network') || myLooking.includes('professional') || myIntents.some((i) => i.includes('recruit') || i.includes('career'))) {
        if (u.occupation || u.profile?.occupation) { score += 14; reasons.push('Career / networking'); }
        if (u.city && myCity && String(u.city).toLowerCase() === myCity) { score += 8; reasons.push('Same city'); }
      } else {
        // Empty-query friendship-first default
        if (shared.length) reasons.push(`Shared: ${shared[0]}`);
        else reasons.push('Open to meet');
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
            ? `You both care about ${shared.slice(0,2).join(' & ')}`
            : (u.bio || 'Someone you might enjoy talking to on Peepal'),
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
        title:'No people to meet right now',
        message:'Invite a friend or search Chaupaal — we never invent matches.',
        actionLabel: 'Invite',
        onAction: () => {
          if (typeof ChaupaalReferrals?.openInviteToChaupaalShare === 'function') {
            ChaupaalReferrals.openInviteToChaupaalShare();
          } else if (typeof shareInviteToChaupaal === 'function') {
            shareInviteToChaupaal();
          }
        },
        secondaryActions: [
          {
            label: 'Search Chaupaal',
            onClick: () => {
              if (typeof openKhojChaupaalSearch === 'function') openKhojChaupaalSearch();
              else if (typeof openUniversalSearch === 'function') {
                openUniversalSearch({ types: ['users', 'duniya', 'peepal', 'groups', 'games'] });
              } else if (typeof openGlobalSearch === 'function') openGlobalSearch();
              else if (typeof openSearch === 'function') openSearch();
              else document.getElementById('openSearchBtn')?.click();
            },
          },
        ],
      });
    } else {
      el.innerHTML = `<div class="discovery-loading">No people suggestions — invite a friend or search Chaupaal.</div>`;
    }
    return el;
  }
  el.innerHTML = `
    <div class="discovery-ai-label">People to meet</div>
    <div class="peepal-discovery-header">
      <div>
        <div class="peepal-discovery-title">You might enjoy talking to</div>
        <div class="peepal-discovery-subtitle">Based on your profile &amp; what you’re looking for</div>
      </div>
      <button class="peepal-undo-btn" id="discoveryUndoBtn" ${discoveryPreviousSet.length?'':'disabled'}>↩ Undo</button>
    </div>
    <div class="discovery-filters" aria-label="Discovery filters">
      <select data-discovery-filter="matchIntent" aria-label="Match intent">
        <option value="">Intent: profile default</option>
        ${PEEPAL_MATCH_INTENTS.map((i) => `<option value="${i}" ${discoveryFilters.matchIntent === i ? 'selected' : ''}>${i}</option>`).join('')}
        <option value="__custom__" ${discoveryFilters.matchIntent && !PEEPAL_MATCH_INTENTS.includes(discoveryFilters.matchIntent) ? 'selected' : ''}>Something else…</option>
      </select>
      <select data-discovery-filter="interest" aria-label="Filter by interest">
        <option value="any">All interests</option>
        ${['Sports','Tech','Business','Music','Food','Travel','Movies','GK','India','World'].map(i=>`<option value="${i}" ${discoveryFilters.interest===i?'selected':''}>${i}</option>`).join('')}
      </select>
      <label><input type="checkbox" data-discovery-filter="sameCity" ${discoveryFilters.sameCity?'checked':''}> Same city</label>
      <label><input type="checkbox" data-discovery-filter="recentlyJoined" ${discoveryFilters.recentlyJoined?'checked':''}> New here</label>
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
              <div class="discovery-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(user.name,user):user.name}${user.isSample?' <span class="cp-demo-badge">Sample</span>':''}</div>
              <div class="discovery-meta">${[user.city,user.age?user.age+'y':'',user.personality||''].filter(Boolean).join(' · ')}${user._isNew?' · <span class="discovery-new-badge">New here</span>':''}</div>
            </div>
            <button class="discovery-dismiss" data-uid="${user.uid}" title="Not interested">✕</button>
          </div>
          ${(reasons||[]).length?`<div class="discovery-shared">${reasons.slice(0,4).map(r=>`<span class="discovery-shared-tag">${String(r).startsWith('📌')||String(r)==='Sample'?r:`📌 ${r}`}</span>`).join('')}</div>`:''}
          <div class="discovery-reason">"${(typeof interestOverlapReason==='function' && interestOverlapReason(user)) || reason||'Shared interests on Chaupaal'}"</div>
          <div class="discovery-transparency" style="font-size:11px;color:var(--muted);margin:4px 0 8px;">Why this pick: ${(reasons||[]).slice(0,2).join(' · ') || 'profile overlap'}</div>
          ${ib?`<div class="discovery-icebreaker"><div class="discovery-icebreaker-label">Conversation starter</div><div class="discovery-icebreaker-text">"${ib.line || ib.answer}"</div></div>`:''}
          <div class="discovery-actions">
            <button class="discovery-view-btn" data-uid="${user.uid}">View profile</button>
            <button class="discovery-friend-btn" data-friend-uid="${user.uid}">Add Friend</button>
          </div>
          <button class="discovery-nudge-btn discovery-nudge-btn--secondary" data-uid="${user.uid}" data-name="${user.name}" data-avatar="${user.avatar||'👤'}" data-icebreakers="${ibJson}" data-starter="${encodeURIComponent(ib?.line || ib?.answer || '')}">💬 ${ib?.cta || 'Ask about their prompt'}</button>
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
          if(typeof showToast==='function') showToast('Got it — fewer like this');
        },280);
      } else if(typeof showToast==='function') showToast('Got it — fewer like this');
    });
  });

  el.querySelectorAll('[data-discovery-filter]').forEach(control=>{
    control.addEventListener('change',async()=>{
      const key=control.dataset.discoveryFilter;
      if (key === 'matchIntent' && control.value === '__custom__') {
        const typed = typeof promptNameSheet === 'function'
          ? await promptNameSheet({ title: 'Match intent', placeholder: 'What are you looking for?', confirmLabel: 'Use' })
          : window.prompt('What are you looking for?');
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
      }else if(typeof showToast==='function') showToast('Profile unavailable');
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
      if(typeof showToast==='function') showToast('Could not open chat — try again');
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
      ? `Ask about “${shortQ}” — they said “${snippet.answer}”`
      : `Ask them about: “${snippet.answer}”`;
    return {
      ...snippet,
      line,
      cta: shortQ ? `Ask: ${shortQ.slice(0, 28)}${shortQ.length > 28 ? '…' : ''}` : 'Ask about their prompt',
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
      line: `You both light up around ${label} — ask how they got into it`,
      cta: `Ask about ${label}`,
      source: 'shared',
    };
  }
  if (user?.bio && String(user.bio).trim().length > 8) {
    const bio = String(user.bio).trim();
    const clip = bio.length > 64 ? bio.slice(0, 62) + '…' : bio;
    return {
      answer: clip,
      line: `Open with their bio: “${clip}”`,
      cta: 'Ask about their bio',
      source: 'bio',
    };
  }
  if (user?.city) {
    return {
      answer: user.city,
      line: `Ask what they’d show a friend visiting ${user.city} for one evening`,
      cta: `Ask about ${user.city}`,
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

async function getCompatibilityPeeks(opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(20, Number(o.limit) || 3));
  const reset = !!o.reset;
  const friendshipOnly = !!o.friendshipOnly;
  const networkingDefault = !!o.networkingDefault || isViewerProfessional();
  if (reset || !_compatPeekCache.length) {
    const prevIntent = discoveryFilters.matchIntent;
    if (networkingDefault && !friendshipOnly) {
      discoveryFilters.matchIntent =
        discoveryFilters.matchIntent || 'Networking / Professional connections';
    } else if (friendshipOnly || o.emptyFriendship) {
      discoveryFilters.matchIntent = 'Friendship';
    }
    let raw = [];
    try {
      raw = typeof getDiscoveryProfiles === 'function' ? await getDiscoveryProfiles() : [];
    } catch (e) {
      raw = [];
    }
    // Hydrate relationships so stranger filter can drop friends / pending
    try {
      if (typeof hydrateRelationships === 'function' && raw.length) {
        await hydrateRelationships(raw.map((p) => p.user?.uid || p.uid).filter(Boolean));
        raw = raw.filter((p) => isDiscoveryEligibleUser(p.user || p));
      }
    } catch (e) {}
    if (networkingDefault && !friendshipOnly) {
      discoveryFilters.matchIntent = prevIntent;
    } else if (friendshipOnly || o.emptyFriendship) {
      discoveryFilters.matchIntent = prevIntent;
    }
    // Pull a wider pool for Khoj scroll when possible
    // Guest-only labeled samples — never pad signed-in discovery with invented people.
    if (
      raw.length < 8 &&
      !(typeof currentUser !== 'undefined' && currentUser) &&
      typeof SAMPLE_DISCOVERY_POOL !== 'undefined'
    ) {
      const extra = SAMPLE_DISCOVERY_POOL.filter((u) => isDiscoveryEligibleUser(u)).map((u) => ({
        user: { ...u, isSample: true },
        score: 50,
        reasons: ['Sample', ...((u.interests || []).slice(0, 1))],
        reason: 'Sample · sign in for real people',
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
      : escCompat(user.name || 'Someone');
  const why = (peek.reasons || []).slice(0, 2).join(' · ') || peek.reason || '';
  return `
    <article class="peepal-compat-peek${user.isSample || peek.isSample ? ' peepal-compat-peek--sample' : ''}" data-uid="${escCompat(user.uid)}">
      <div class="peepal-compat-peek-avatar">${
        user.photoURL
          ? `<img src="${escCompat(user.photoURL)}" alt="">`
          : escCompat(user.avatar || '👤')
      }</div>
      <div class="peepal-compat-peek-body">
        <div class="peepal-compat-peek-name">${nameHtml}${user.isSample || peek.isSample ? ' <span class="cp-demo-badge">Sample</span>' : ''}</div>
        <div class="peepal-compat-peek-meta">${[user.city, user.age ? user.age + 'y' : '', peek.lean === 'friendship' ? 'Friendship' : '']
          .filter(Boolean)
          .map(escCompat)
          .join(' · ')}</div>
        ${why ? `<div class="peepal-compat-peek-why">${escCompat(why)}</div>` : ''}
        ${
          ice
            ? `<div class="peepal-compat-peek-ice"><strong>Icebreaker</strong>${escCompat(ice.line || ice.answer)}</div>`
            : ''
        }
        <div class="peepal-compat-peek-actions">
          <button type="button" class="peepal-compat-peek-view" data-uid="${escCompat(user.uid)}">Profile</button>
          <button type="button" class="peepal-compat-peek-chat" data-uid="${escCompat(user.uid)}" data-name="${escCompat(user.name || '')}" data-avatar="${escCompat(user.avatar || '👤')}" data-icebreakers="${ibJson}" data-starter="${starter}">${escCompat(ice?.cta || 'Ask them')}</button>
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
        showToast(starterText || 'Open chat from Baithak');
      }
    });
  });
}

async function mountCompatPeeks(host, opts) {
  if (!host) return [];
  const o = opts || {};
  host.innerHTML = `<div class="discovery-loading" style="padding:8px;font-size:12px;">Finding compatible people…</div>`;
  try {
    const { peeks } = await getCompatibilityPeeks({
      limit: o.limit || 3,
      reset: o.reset !== false,
      friendshipOnly: !!o.friendshipOnly,
      emptyFriendship: !!o.emptyFriendship,
      friendshipMajority: o.friendshipMajority !== false,
    });
    if (!peeks.length) {
      host.innerHTML = `<div class="khoj-compat-empty">No eligible people to suggest right now — try Khoj or widen your search. We never invent profiles.</div>`;
      return [];
    }
    host.innerHTML = peeks.map(renderCompatPeekCard).join('');
    wireCompatPeekHost(host, peeks);
    return peeks;
  } catch (e) {
    host.innerHTML = `<div class="khoj-compat-empty">Couldn’t load peeks — try again shortly.</div>`;
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

