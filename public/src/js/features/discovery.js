// ===================== PEEPAL AI PEOPLE SEARCH =====================

const PEEPAL_SEARCH_NUDGES = [
  {emoji:'â¤ï¸', text:'Looking for someone to date?', hint:'Type something like "someone fun around 25 who loves movies and travel"'},
  {emoji:'ðŸ¤', text:'Want new friends?', hint:'Try "cricket fan from Delhi who likes startups"'},
  {emoji:'ðŸ’¼', text:'Hiring or job hunting?', hint:'Try "frontend developer looking for opportunities" or "hiring designers"'},
  {emoji:'âœˆï¸', text:'Planning a trip?', hint:'Try "travel buddy for Ladakh in December"'},
  {emoji:'ðŸŽ®', text:'Find a game partner', hint:'Try "someone to play chess or word games with"'},
  {emoji:'ðŸŽµ', text:'Bond over music', hint:'Try "Bollywood music lover who also likes jazz"'},
  {emoji:'ðŸ“š', text:'Start a book club', hint:'Try "non-fiction reader interested in history"'},
  {emoji:'ðŸ‹ï¸', text:'Find a fitness buddy', hint:'Try "morning runner or gym person in Bangalore"'},
  {emoji:'ðŸ›', text:'Foodie connections', hint:'Try "food lover who likes trying new restaurants"'},
  {emoji:'ðŸ§ ', text:'Intellectual debates', hint:'Try "someone who loves discussing politics, philosophy or science"'},
  {emoji:'ðŸŽ¬', text:'Movie or series partner', hint:'Try "thriller movie buff who watches OTT"'},
  {emoji:'ðŸš€', text:'Find a co-founder', hint:'Try "startup-minded person with product sense"'},
];

// Intent â†’ criteria mapping (no API call needed for common patterns)
const INTENT_MAP = {
  dating: {gender_preference:'opposite', interests:['relationships','lifestyle'], personality:'social', vibe:'romantic connection'},
  friendship: {interests:[], personality:null, vibe:'new friends'},
  'job hunting': {interests:['Business','Tech'], personality:'intellectual', vibe:'career opportunities'},
  hiring: {interests:['Business','Tech'], personality:'intellectual', vibe:'recruitment'},
  travel: {interests:['travel','adventure'], personality:'outdoorsy', vibe:'travel companion'},
  cricket: {interests:['Sports'], topCat:'Sports', vibe:'cricket enthusiast'},
  'book club': {interests:['GK','education'], personality:'intellectual', vibe:'reading and books'},
  fitness: {interests:['health','fitness'], personality:'outdoorsy', vibe:'fitness and workout'},
  music: {interests:['Music'], vibe:'music lover'},
  food: {interests:['food','cooking'], vibe:'foodie'},
  movies: {interests:['movies','entertainment'], personality:'cinephile', vibe:'film enthusiast'},
  startup: {interests:['Business','Tech'], personality:'intellectual', vibe:'startup ecosystem'},
  gaming: {interests:['gaming','tech'], vibe:'gaming partner'},
  debate: {interests:['politics','GK','World'], personality:'intellectual', vibe:'intellectual debate'},
};

async function runPeepalAiSearch(opts){
  const o = opts || {};
  const input = document.getElementById('peepalAiSearchInput');
  const query = (o.query != null ? String(o.query) : input?.value || '').trim();
  if(!query) return;
  if(input && o.query != null) input.value = query;
  const resultsEl = document.getElementById('peepalAiSearchResults');
  if(!resultsEl) return;

  if(typeof renderSkeleton==='function') renderSkeleton(resultsEl, {variant:'card', count:2});
  else resultsEl.innerHTML = `<div class="peepal-ai-thinking">Finding the right people for you...</div>`;

  try{
    // Unified brain: server intent_discover (parse â†’ assume â†’ retrieve â†’ rank â†’ learn hooks)
    let envelope = null;
    if(typeof apiFetch === 'function' && typeof currentUser !== 'undefined' && currentUser){
      try{
        envelope = await apiFetch('/api/peepal-reactions', {
          method: 'POST',
          needAuth: true,
          body: {
            action: 'intent_discover',
            query,
            chipIntent: o.chipIntent || null,
            limit: 10,
            ai: o.ai,
          },
        });
      }catch(e){
        console.warn('[discovery] intent_discover failed, falling back', e?.message || e);
      }
    }

    const data = envelope?.ok && envelope.data ? envelope.data : null;
    if(data && Array.isArray(data.matches)){
      await renderIntentDiscoverResults(resultsEl, query, data);
      return;
    }

    // Fallback: deterministic local INTENT_MAP + public pool (AI-off / offline)
    await runPeepalAiSearchLocalFallback(query, resultsEl);
  }catch(err){
    console.error(err);
    if(typeof renderErrorState==='function'){
      renderErrorState(resultsEl, {
        title:'Search couldnâ€™t finish',
        message: typeof friendlyError==='function'?friendlyError(err):'Couldnâ€™t connect right now. Try again in a moment.',
        onRetry:()=>runPeepalAiSearch(),
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">Couldn't connect right now. Try again in a moment.</div>`;
    }
  }
}

async function renderIntentDiscoverResults(resultsEl, query, data){
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const plan = data.plan || {};
  const refineChips = Array.isArray(data.refineChips) ? data.refineChips : [];
  const intentProfileId = data.intentProfileId || null;

  let aiMsgLimit = null;
  try {
    if (typeof PolicyUsage?.getRemaining === 'function') {
      aiMsgLimit = await PolicyUsage.getRemaining('aiDiscoveryMsg');
    }
  } catch (e) {}
  const aiCollapsed = !!(aiMsgLimit && aiMsgLimit.exhausted);
  if (typeof AiDiscoveryMeter?.injectStyles === 'function') AiDiscoveryMeter.injectStyles();
  try {
    if (typeof AiDiscoveryMeter?.mountOnIntentCardCompact === 'function') {
      AiDiscoveryMeter.mountOnIntentCardCompact(document.getElementById('peepalIntentCard'), { disclosePro: true });
    }
  } catch (e) {}

  if(!matches.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(resultsEl, {
        icon:(typeof TabElements!=='undefined'&&TabElements.markHtml)?TabElements.markHtml('peepal',40):'ðŸŒ³',
        title:'No matches yet',
        message: data.emptyMessage || 'No eligible people matched that search. We never invent profiles â€” try broader wording.',
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">${data.emptyMessage || 'No matches found.'}</div>`;
    }
    return;
  }

  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  resultsEl.innerHTML = `
    ${aiCollapsed ? `<div class="peepal-ai-limit-banner">${aiMsgLimit.unlock || 'AI Discovery messaging limit reached.'} Professional profiles found here stay unlimited.</div>` : ''}
    <div id="peepalAiMeterHost"></div>
    <div class="${aiCollapsed ? 'peepal-ai-results-collapsed' : ''}" id="peepalAiResultsBody">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">Top ${matches.length} matches</div>
        <div style="font-size:11px;color:var(--muted);">${plan.vibe ? `"${esc(String(plan.vibe).slice(0,40))}"` : (data.mode === 'deterministic' ? 'Preference match' : 'AI-assisted')}</div>
      </div>
      ${refineChips.length ? `<div class="discovery-refine-chips" data-nav-ignore="1">${refineChips.map(c=>`<button type="button" class="peepal-nudge-chip" data-refine="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>` : ''}
    </div>
  `;
  const bodyEl = document.getElementById('peepalAiResultsBody') || resultsEl;
  const meterHost = document.getElementById('peepalAiMeterHost');
  if (meterHost && typeof AiDiscoveryMeter?.mountMeter === 'function') {
    AiDiscoveryMeter.mountMeter(meterHost, { compact: true });
  }

  resultsEl.querySelectorAll('[data-refine]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.refine;
      let next = query;
      if (id === 'widen_location') next = `${query} anywhere`;
      else if (id === 'include_everyone' || id === 'gender_everyone') next = `${query} everyone`;
      else if (id === 'gender_women') next = `${query} women`;
      else if (id === 'gender_men') next = `${query} men`;
      runPeepalAiSearch({ query: next });
    });
  });

  matches.forEach((m) => {
    const user = {
      uid: m.uid,
      name: m.name,
      username: m.username,
      photoURL: m.photoURL,
      city: m.city,
      age: m.age,
      bio: m.bio,
      interests: m.interests || [],
      icebreakers: m.icebreakers || [],
      profileType: m.profileType || 'personal',
      avatar: 'ðŸ‘¤',
    };
    const reason = m.explain || 'Matched on open profile';
    const theirIb = typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):(user.icebreakers||[]);
    const ib = typeof craftSpecificIcebreaker==='function'
      ? craftSpecificIcebreaker(user, { shared: user.interests || [], reason })
      : (typeof pickIcebreakerSnippet==='function' ? pickIcebreakerSnippet(theirIb) : null);
    const matchPct = m.matchPct || 50;
    const starter = (ib && (ib.line || ib.answer))
      || `Hey ${String(user.name||'').split(' ')[0] || 'there'} — found you while looking for ${plan.searchIntent && plan.searchIntent !== 'any' ? plan.searchIntent : 'people'} on Chaupaal`;

    const card = document.createElement('div');
    card.className = 'peepal-ai-result-card';
    card.dataset.uid = user.uid;
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:50px;height:50px;border-radius:var(--r-card,20px);background:var(--line);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden;">
          ${user.photoURL?`<img src="${esc(user.photoURL)}" style="width:100%;height:100%;object-fit:cover;">`:(typeof renderUserAvatarHtml==='function'?renderUserAvatarHtml(user,{decorative:true}):(user.avatar||'👤'))}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(user.name,user):esc(user.name)}</div>
          <div style="font-size:11px;color:var(--muted);">${[user.city,user.age?user.age+'y':''].filter(Boolean).map(esc).join(' · ')}</div>
          ${user.bio?`<div style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">"${esc(user.bio)}"</div>`:''}
        </div>
        <div style="background:rgba(230,57,70,0.1);color:var(--red);border-radius:var(--r-control,14px);padding:5px 11px;font-size:12px;font-weight:700;flex-shrink:0;">${matchPct}%</div>
      </div>
      ${(user.interests||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">${(user.interests||[]).slice(0,4).map(i=>`<span style="background:rgba(230,57,70,0.07);color:var(--red);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;">${esc(i)}</span>`).join('')}</div>`:''}
      <div class="ai-match-reason" style="margin-top:8px;font-size:12px;color:var(--ink-secondary,var(--muted));">${esc(reason)}</div>
      ${ib?`<div class="discovery-icebreaker"><div class="discovery-icebreaker-label">Conversation starter</div><div class="discovery-icebreaker-text">"${esc(ib.line || ib.answer)}"</div></div>`:''}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="peepal-ai-feedback" data-sig="more_like" title="More like this">♥ More like this</button>
        <button type="button" class="peepal-ai-feedback" data-sig="not_interested" title="Not interested">✕ Not interested</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="peepal-ai-view-btn" style="flex:1;padding:9px;background:var(--surface-sunken,var(--cream));border:2px solid var(--line);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">View profile</button>
        <button class="peepal-ai-chat-btn" data-name="${esc(user.name)}" data-uid="${esc(user.uid)}" data-starter="${esc(starter)}" style="flex:1;padding:9px;background:var(--red);color:#fff;border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">${esc(ib?.cta || 'Ask them')}</button>
      </div>
    `;

    card.querySelectorAll('.peepal-ai-feedback').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const signal = btn.dataset.sig;
        try {
          if (typeof apiFetch === 'function') {
            await apiFetch('/api/peepal-reactions', {
              method: 'POST',
              needAuth: true,
              body: {
                action: 'discovery_person_signal',
                candidateUid: user.uid,
                signal,
                intentProfileId,
              },
            });
          }
          if (typeof showToast === 'function') {
            showToast(signal === 'more_like' ? "Noted â€” we'll show more like this" : 'Got it â€” less of this');
          }
          if (signal === 'not_interested') card.remove();
        } catch (err) {
          if (typeof showToast === 'function') showToast('Could not save preference');
        }
      });
    });

    card.querySelector('.peepal-ai-view-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openPublicProfile === 'function') {
        openPublicProfile(user, { uid: user.uid, username: user.username, context: 'discovery' });
      }
    });

    card.querySelector('.peepal-ai-chat-btn')?.addEventListener('click', (e) => {
      const name = e.currentTarget.dataset.name;
      const suggestedStarter = e.currentTarget.dataset.starter;
      if (typeof openDmWithSharedHello === 'function') {
        openDmWithSharedHello({
          uid: user.uid,
          name,
          avatar: user.avatar || 'ðŸ‘¤',
          theirIcebreakers: theirIb,
          starterText: suggestedStarter,
          origin: 'ai_discovery',
          peerProfileType: user.profileType || 'personal',
          matchMeta: { intentProfileId, signalScores: m.signalScores || {} },
        });
      }
    });

    bodyEl.appendChild(card);
  });
}

/** Local fallback when server discover is unavailable â€” never invents users. */
async function runPeepalAiSearchLocalFallback(query, resultsEl){
  const queryLower = query.toLowerCase();
  let quickCriteria = null;
  for(const [intent, criteria] of Object.entries(INTENT_MAP)){
    if(queryLower.includes(intent)){quickCriteria = {...criteria, detectedIntent: intent};break;}
  }
  let criteria = {interests:[],ageRange:{min:null,max:null},gender:'any',city:null,personality:null,searchIntent:'any',vibe:'',conversationStarter:''};
  if(quickCriteria){
    criteria = {...criteria, ...quickCriteria, searchIntent: quickCriteria.detectedIntent || 'any'};
  }

  const pool = [];
  if(db && currentUser){
    try{
      const snap = await db.collection('users_public').where('openToMeet','==',true).limit(40).get();
      snap.docs.forEach(d=>{
        const u=d.data();
        if(u.hiddenFromDiscovery) return;
        if((u.uid||d.id)!==currentUser.uid&&u.name){
          pool.push({ ...u, uid:u.uid||d.id });
        }
      });
    }catch(e){}
  }

  // Never invent: if pool empty, honest empty state (ignore SAMPLE_DISCOVERY_POOL fabricated names)
  if(!pool.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(resultsEl, {
        icon:(typeof TabElements!=='undefined'&&TabElements.markHtml)?TabElements.markHtml('peepal',40):'ðŸŒ³',
        title:'No matches yet',
        message:'No eligible open profiles right now. We never invent people â€” try again as the community grows.',
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">No eligible open profiles right now.</div>`;
    }
    return;
  }

  const scored = pool.map(u=>{
    let score = 1;
    const reasons = [];
    const interests = (u.interests||[]).map(i=>String(i).toLowerCase());
    (criteria.interests||[]).forEach(i=>{
      if(interests.includes(String(i).toLowerCase())){ score += 20; reasons.push(i); }
    });
    if(criteria.city && String(u.city||'').toLowerCase().includes(String(criteria.city).toLowerCase())){
      score += 25; reasons.push('city');
    }
    return {user:u, score, reasons, matchPct: Math.min(99, Math.max(30, Math.round(score*1.8)))};
  }).filter(m => m.score > 1).sort((a,b)=>b.score-a.score).slice(0,10);

  await renderIntentDiscoverResults(resultsEl, query, {
    mode: 'deterministic',
    plan: { searchIntent: criteria.searchIntent, vibe: criteria.vibe, hardFilters: {}, appliedAssumptionIds: [], suppressedAssumptionIds: [] },
    refineChips: [],
    matches: scored.map(({user, score, reasons, matchPct})=>({
      uid: user.uid,
      name: user.name,
      photoURL: user.photoURL,
      city: user.city,
      age: user.age,
      bio: user.bio,
      interests: user.interests || [],
      icebreakers: user.icebreakers || [],
      profileType: user.profileType || 'personal',
      score,
      matchPct,
      explain: reasons.length ? `Matched on ${reasons.slice(0,3).join(' & ')}` : 'Matched on open profile',
    })),
    empty: !scored.length,
    emptyMessage: 'No matches found yet. Try broader terms.',
  });
}

// ===================== ACTIVITY STATUS =====================
let _activityInterval = null;

function initActivityStatus(){
  if(!db||!currentUser) return;
  // Set own status to online
  const statusRef = db.collection('user_status').doc(currentUser.uid);
  statusRef.set({online:true, lastSeen:firebase.firestore.FieldValue.serverTimestamp(), uid:currentUser.uid}).catch(()=>{});
  // Update on visibility change
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){statusRef.update({online:false,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});}
    else{statusRef.update({online:true}).catch(()=>{});}
  });
  // Heartbeat every 60s
  _activityInterval = setInterval(()=>{
    if(!document.hidden) statusRef.update({online:true,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
  },60000);
  // Set offline on unload
  window.addEventListener('beforeunload',()=>statusRef.update({online:false,lastSeen:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{}));
}

async function getUserStatus(uid){
  if(!db) return null;
  try{
    const snap = await db.collection('user_status').doc(uid).get();
    if(!snap.exists) return null;
    return snap.data();
  }catch(e){return null;}
}

function formatActivityStatus(statusData){
  if(!statusData) return '<span class="chat-presence-line">Offline</span>';
  if(statusData.online) {
    return '<span class="chat-presence-line is-online"><span class="chat-presence-dot" aria-hidden="true"></span>Online</span>';
  }
  const lastSeen = statusData.lastSeen?.toDate?.() || (statusData.lastSeen ? new Date(statusData.lastSeen) : null);
  const valid = lastSeen && !Number.isNaN(lastSeen.getTime()) && lastSeen.getTime() > 0;
  if(!valid) return '<span class="chat-presence-line">Offline</span>';
  const rel = typeof formatRelativeTime==='function'
    ? formatRelativeTime(lastSeen)
    : lastSeen.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  const when = String(rel || '').replace(/^last seen\s+/i, '');
  return `<span class="chat-presence-line">Last seen ${when}</span>`;
}

// Add status badge to chat headers
async function injectChatActivityStatus(uid){
  const status = await getUserStatus(uid);
  const el = document.getElementById('chatActivityStatus');
  if(el) el.innerHTML = formatActivityStatus(status);
}

// ===================== OPEN TO MEET ENFORCEMENT =====================
function isOpenToMeet(userObj){
  return userObj?.openToMeet !== false; // default true
}

function filterOpenToMeetProfiles(profiles){
  return profiles.filter(p => isOpenToMeet(p));
}

// Discovery profile loading + openToMeet filtering lives in discovery-core.js

// Show explanation when toggling open-to-meet
function handleOpenToMeetToggle(newValue){
  openToMeet = newValue;
  try{localStorage.setItem('chaupaal_open_to_meet', JSON.stringify(openToMeet));}catch(e){}
  if(db&&currentUser) db.collection('users').doc(currentUser.uid).update({openToMeet}).then(()=>{
    if(typeof UsersPublic?.syncPublicProfile==='function'){
      UsersPublic.syncPublicProfile(currentUser.uid, {...(userProfile||{}), openToMeet});
    }
  }).catch(()=>{});

  if(newValue){
    // Show what it means
    const sheet = document.createElement('div');
    sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:24px;z-index:100;';
    sheet.innerHTML=`
      <div style="font-size:28px;text-align:center;margin-bottom:12px;">ðŸ‘‹</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;text-align:center;margin-bottom:8px;">You're open to meeting people!</div>
      <div style="font-size:13px;color:var(--muted);text-align:center;line-height:1.6;margin-bottom:16px;">Your profile may now appear in Peepal's "You might enjoy talking to" section and in people's AI search results. You can turn this off anytime in Settings.</div>
      <div style="background:var(--cream);border-radius:14px;padding:14px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:8px;">What this means:</div>
        ${['Your profile shows up in Peepal discoveries for people with similar interests','AI search results include you when someone describes your type','You\'ll see more relevant people in your own Peepal feed','You can turn off at any time â€” no one is notified'].map(t=>`<div style="font-size:12px;color:var(--muted);padding:4px 0;display:flex;gap:8px;"><span>âœ“</span><span>${t}</span></div>`).join('')}
      </div>
      <button id="closeOpenToMeetSheet" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">Got it! ðŸŽ‰</button>
    `;
    document.querySelector('.device').appendChild(sheet);
    document.getElementById('closeOpenToMeetSheet').addEventListener('click',()=>sheet.remove());
  } else {
    showToast(t('peepal_discovery_off'));
  }
}

// ===================== ANONYMOUS QUESTIONS IN PEEPAL =====================
async function getAnonRemaining() {
  if (typeof PolicyUsage?.getRemaining === 'function') {
    return PolicyUsage.getRemaining('anon');
  }
  const lim = window.PolicyLimits?.ANON_POSTS || { perDay: 2, perWeek: 7 };
  return {
    remaining: lim.perDay,
    dayLeft: lim.perDay,
    weekLeft: lim.perWeek,
    perDay: lim.perDay,
    perWeek: lim.perWeek,
    exhausted: false,
    unlock: '',
  };
}

function openPeepalAskSheet(editPost = null){
  const isEdit = !!(editPost && (editPost.firestoreId || editPost.id));
  const editId = isEdit ? (editPost.firestoreId || editPost.id) : null;
  const sheet = document.createElement('div');
  sheet.className = 'peepal-ask-sheet';
  const lim = window.PolicyLimits?.ANON_POSTS || { perDay: 2, perWeek: 7 };
  const attachDefs = [
    { type: 'photo', icon: '📷', label: 'Photo' },
    { type: 'video', icon: '🎬', label: 'Video' },
    { type: 'music', icon: '🎵', label: 'Music' },
    { type: 'voice', icon: '🎤', label: 'Voice' },
    { type: 'gif', icon: 'GIF', label: 'GIF' },
    { type: 'sticker', icon: '😄', label: 'Sticker' },
    { type: 'link', icon: '🔗', label: 'Link' },
    { type: 'location', icon: '📍', label: 'Location' },
    { type: 'mention', icon: '@', label: 'Mention' },
    { type: 'hashtag', icon: '#', label: 'Hashtag' },
    { type: 'document', icon: '📄', label: 'Document' },
    { type: 'collab', icon: '🤝', label: 'Collab' },
  ];
  let composeAttachments = [];
  let selectedCap = '10';
  sheet.innerHTML = `
    <div class="peepal-ask-header">
      <button id="closeAsk" aria-label="Close" style="background:var(--surface-sunken,var(--cream));border:none;border-radius:999px;cursor:pointer;padding:8px;color:var(--ink);width:36px;height:36px;display:flex;align-items:center;justify-content:center;">${typeof iconHtml==='function' ? iconHtml('x',{size:18}) : '✕'}</button>
      <div class="peepal-ask-title">${isEdit ? 'Edit discussion' : 'Discuss'}</div>
      <button id="peepalPublishBtn" style="background:var(--red);color:#fff;border:none;border-radius:999px;padding:8px 20px;font:700 14px 'Space Grotesk',sans-serif;min-width:60px;cursor:pointer;">${isEdit ? 'Save' : 'Post'}</button>
    </div>
    <div class="peepal-ask-body">
      <div id="anonToggleRow" style="background:var(--line);border:2px solid var(--line);border-radius:14px;padding:12px;margin-bottom:16px;display:${isEdit ? 'none' : 'flex'};align-items:center;gap:12px;opacity:0.5;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">🎭 Post anonymously</div>
          <div id="anonToggleHint" style="font-size:11px;color:var(--muted);">Anonymous posts don't reveal your identity</div>
        </div>
        <label class="switch" id="anonToggleLabel" style="pointer-events:none;"><input type="checkbox" id="anonToggle" disabled><span class="slider"></span></label>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;">
        ${[{id:'open',label:'💬 Open'},{id:'poll',label:'📊 Poll'}].map((f,i)=>`<button class="peepal-format-chip${i===0?' active':''}" data-fmt="${f.id}" style="padding:8px 14px;border-radius:999px;border:2px solid ${i===0?'var(--red)':'var(--line)'};background:${i===0?'rgba(230,57,70,0.08)':'var(--white)'};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;color:${i===0?'var(--red)':'var(--ink)'};">${f.label}</button>`).join('')}
      </div>
      <div id="peepalAskCatRow" style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;align-items:center;">
        <span style="font-size:11px;font-weight:700;color:var(--muted);flex-shrink:0;">Topic</span>
      </div>
      <textarea id="peepalQText" placeholder="What's on your mind?" style="width:100%;min-height:100px;border:2px solid var(--line);border-radius:14px;padding:12px;font-family:Inter,sans-serif;font-size:15px;outline:none;resize:none;box-sizing:border-box;background:var(--cream);"></textarea>
      <div class="peepal-compose-toolbar" id="peepalComposeToolbar">
        <button type="button" class="pct-btn" data-attach="photo" title="Photo">📷</button>
        <button type="button" class="pct-btn" data-attach="gif" title="GIF">GIF</button>
        <button type="button" class="pct-btn" data-attach="music" title="Music">🎵</button>
        <button type="button" class="pct-btn pct-btn--more" id="peepalAttachMore" title="More">+</button>
      </div>
      <div class="peepal-attach-preview" id="peepalAttachPreview"></div>
      <div id="peepalAttachGridHost"></div>
      <div id="peepalLinkRow" class="peepal-link-row" style="display:none;"><input id="peepalLinkInput" type="url" placeholder="https://"><button type="button" id="peepalLinkAdd">Add</button></div>
      <div id="peepalCollabRow" class="peepal-collab-row" style="display:none;"><input id="peepalCollabInput" type="text" placeholder="Invite co-author by username"><button type="button" id="peepalCollabAdd">Add</button></div>
      <div id="mcqOptions" style="margin-top:10px;display:none;">
        ${[1,2,3,4].map(i=>`<input id="mcqOpt${i}" placeholder="Option ${i}${i>2?' (optional)':''}" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;outline:none;margin-bottom:8px;box-sizing:border-box;background:var(--white);">`).join('')}
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Audience</div>
        <select id="peepalAudience" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;">
          <option value="everyone">🌍 Everyone</option>
          <option value="friends">👥 Friends only</option>
          <option value="ai">🤖 AI decides</option>
          <option value="save_only">💾 Save without posting</option>
        </select>
      </div>
      <!-- Response cap -->
      <div style="margin-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;
                    letter-spacing:0.05em;margin-bottom:6px;">Responses wanted</div>
        <div id="peepalResponseCapRow" style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="peepal-cap-btn active" data-cap="10">10</button>
          <button type="button" class="peepal-cap-btn" data-cap="25">25</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--free-max" data-cap="50">50</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--pro" data-cap="100"
                  title="Pro feature">100 ✦</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--pro" data-cap="500"
                  title="Pro feature">500 ✦</button>
          <button type="button" class="peepal-cap-btn peepal-cap-btn--pro" data-cap="unlimited"
                  title="Pro feature">Unlimited ✦</button>
        </div>
        <div id="peepalCapHint" style="font-size:11px;color:var(--muted);margin-top:5px;line-height:1.4;">
          Free posts get up to 50 responses. Higher caps are a Pro feature.
        </div>
      </div>
      <input id="peepalPhotoInput" type="file" accept="image/*" hidden>
      <input id="peepalVideoInput" type="file" accept="video/*" hidden>
      <input id="peepalAudioInput" type="file" accept="audio/*" hidden>
      <input id="peepalDocInput" type="file" accept=".pdf,.doc,.docx,.txt" hidden>
    </div>
  `;
  document.querySelector('.device').appendChild(sheet);
  requestAnimationFrame(()=>sheet.classList.add('open'));
  if(typeof pushNavLayer==='function'){
    sheet.dataset.navManaged='1';
    pushNavLayer(sheet,()=>{ sheet.classList.remove('open'); setTimeout(()=>sheet.remove(),350); });
  }

  // Topic chips from CategoryPrefs (same manage sheet as Akhbaar)
  let peepalAskCat = '';
  try {
    const catRow = sheet.querySelector('#peepalAskCatRow');
    if (catRow && typeof CategoryPrefs !== 'undefined') {
      const cats = (CategoryPrefs.getOrderedCategories?.() || [])
        .filter((c) => c.name && c.name !== 'all' && c.name !== 'saathi')
        .slice(0, 10);
      cats.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'peepal-ask-cat-chip';
        btn.dataset.cat = c.name;
        btn.textContent = `${c.emoji || '✨'} ${c.name}`;
        btn.style.cssText =
          'padding:6px 11px;border-radius:999px;border:1.5px solid var(--line);background:var(--white);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;';
        btn.addEventListener('click', () => {
          peepalAskCat = peepalAskCat === c.name ? '' : c.name;
          catRow.querySelectorAll('.peepal-ask-cat-chip').forEach((b) => {
            const on = b.dataset.cat === peepalAskCat;
            b.style.borderColor = on ? 'var(--red)' : 'var(--line)';
            b.style.color = on ? 'var(--red)' : 'var(--ink)';
            b.style.background = on ? 'rgba(230,57,70,0.08)' : 'var(--white)';
          });
          if (peepalAskCat) CategoryPrefs.touchCategory?.(peepalAskCat);
        });
        catRow.appendChild(btn);
      });
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.textContent = 'Manage';
      manage.style.cssText =
        'padding:6px 10px;border:none;background:none;color:var(--red);font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;';
      manage.addEventListener('click', () => CategoryPrefs.openCategoryManageSheet?.());
      catRow.appendChild(manage);
    }
  } catch (e) {}

  let anonQuota = { exhausted: true, remaining: 0, dayLeft: 0, weekLeft: lim.perWeek, unlock: '' };
  (async () => {
    try {
      anonQuota = await getAnonRemaining();
    } catch (e) {}
    const row = document.getElementById('anonToggleRow');
    const hint = document.getElementById('anonToggleHint');
    const label = document.getElementById('anonToggleLabel');
    const toggle = document.getElementById('anonToggle');
    if (!row || !hint || !toggle) return;
    const available = !anonQuota.exhausted && anonQuota.remaining > 0 && !anonQuota.readFailed;
    if (available) {
      row.style.background = 'rgba(230,57,70,0.05)';
      row.style.borderColor = 'var(--red)';
      row.style.opacity = '1';
      hint.textContent = `${anonQuota.dayLeft} anonymous left today · ${anonQuota.weekLeft} this week (max ${lim.perDay}/day, ${lim.perWeek}/week)`;
      label.style.pointerEvents = '';
      toggle.disabled = false;
    } else {
      row.style.background = 'var(--line)';
      row.style.borderColor = 'var(--line)';
      row.style.opacity = '0.5';
      hint.textContent = anonQuota.readFailed
        ? (anonQuota.unlock || "Couldn't verify anonymous limit — try again shortly.")
        : (anonQuota.unlock || 'Anonymous posting unavailable right now.');
      label.style.pointerEvents = 'none';
      toggle.disabled = true;
      toggle.checked = false;
    }
  })();

  function addAttachment(item){
    const idx = composeAttachments.findIndex((x) => x.type === item.type);
    if (item.type === 'collab') {
      composeAttachments = composeAttachments.filter((x) => x.type !== 'collab');
      composeAttachments.push(item);
    } else if (idx >= 0) composeAttachments[idx] = item;
    else composeAttachments.push(item);
    renderAttachPreview();
  }
  function removeAttachment(type){
    composeAttachments = composeAttachments.filter((a) => a.type !== type);
    renderAttachPreview();
  }
  function renderAttachPreview(){
    const host = document.getElementById('peepalAttachPreview');
    if (!host) return;
    host.innerHTML = composeAttachments.map((a) => {
      const lbl = String(a.label || a.name || a.type);
      return `<div class="peepal-attach-chip">${lbl}<button type="button" data-rm="${a.type}" aria-label="Remove">×</button></div>`;
    }).join('');
    host.querySelectorAll('[data-rm]').forEach((btn) => btn.addEventListener('click', () => removeAttachment(btn.dataset.rm)));
  }
  function toastSoon(kind){
    if (typeof showToast === 'function') showToast(`${kind} — Coming soon`);
  }
  function renderAttachGrid(){
    const host = document.getElementById('peepalAttachGridHost');
    if (!host) return;
    const grid = host.querySelector('.peepal-attach-grid');
    if (grid) {
      grid.remove();
      return;
    }
    const el = document.createElement('div');
    el.className = 'peepal-attach-grid';
    el.innerHTML = attachDefs.map((d) => `<button type="button" class="peepal-attach-grid-btn" data-attach="${d.type}">${d.icon}<span>${d.label}</span></button>`).join('');
    host.appendChild(el);
    el.querySelectorAll('[data-attach]').forEach((b) => b.addEventListener('click', () => handleAttach(b.dataset.attach)));
  }
  async function handleAttach(type){
    const text = document.getElementById('peepalQText');
    if (type === 'photo') return document.getElementById('peepalPhotoInput')?.click();
    if (type === 'video') return document.getElementById('peepalVideoInput')?.click();
    if (type === 'document') return document.getElementById('peepalDocInput')?.click();
    if (type === 'music') {
      if (typeof openMusicPicker === 'function') {
        return openMusicPicker({ onSelect: (song) => song && addAttachment({ type: 'music', label: `🎵 ${song.title || 'Music'}`, song }) });
      }
      return document.getElementById('peepalAudioInput')?.click();
    }
    if (type === 'gif') {
      if (typeof openGifPicker === 'function') {
        return openGifPicker({ onSelect: (gif) => gif && addAttachment({ type: 'gif', label: 'GIF', url: gif.url, preview: gif.preview || gif.url }) });
      }
      return toastSoon('GIF');
    }
    if (type === 'sticker') {
      if (typeof openStickerPicker === 'function') {
        return openStickerPicker({ onSelect: (sticker) => sticker && addAttachment({ type: 'sticker', label: '😄 Sticker', sticker }) });
      }
      return toastSoon('Sticker');
    }
    if (type === 'voice') {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toastSoon('Voice');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          addAttachment({ type: 'voice', label: '🎤 Voice', blob });
        };
        rec.start();
        if (typeof showToast === 'function') showToast('Recording…');
        setTimeout(() => rec.state !== 'inactive' && rec.stop(), 6000);
      } catch (e) {
        if (typeof showToast === 'function') showToast('Mic permission denied');
      }
      return;
    }
    if (type === 'location') {
      if (!navigator.geolocation) return toastSoon('Location');
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = Number(pos.coords?.latitude || 0).toFixed(4);
        const lng = Number(pos.coords?.longitude || 0).toFixed(4);
        const label = typeof resolveLocationLabel === 'function' ? resolveLocationLabel(pos.coords) : `${lat}, ${lng}`;
        addAttachment({ type: 'location', label: `📍 ${label}`, lat: Number(lat), lng: Number(lng) });
      }, () => {
        if (typeof showToast === 'function') showToast('Location unavailable');
      });
      return;
    }
    if (type === 'mention') {
      if (text) {
        text.value = `${text.value || ''}@`;
        text.focus();
      }
      if (typeof openMentionAutocomplete === 'function') openMentionAutocomplete(text);
      return;
    }
    if (type === 'hashtag') {
      if (text) {
        text.value = `${text.value || ''}#`;
        text.focus();
      }
      return;
    }
    if (type === 'link') {
      const row = document.getElementById('peepalLinkRow');
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    if (type === 'collab') {
      const row = document.getElementById('peepalCollabRow');
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    toastSoon(type);
  }

  // Wire format chips
  sheet.querySelectorAll('.peepal-format-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      sheet.querySelectorAll('.peepal-format-chip').forEach(c=>{c.classList.remove('active');c.style.borderColor='var(--line)';c.style.background='var(--white)';c.style.color='var(--ink)';});
      chip.classList.add('active');chip.style.borderColor='var(--red)';chip.style.background='rgba(230,57,70,0.08)';chip.style.color='var(--red)';
      document.getElementById('mcqOptions').style.display = chip.dataset.fmt === 'poll' ? 'block' : 'none';
    });
  });
  const capRow = document.getElementById('peepalResponseCapRow');
  const capHint = document.getElementById('peepalCapHint');
  const setCapUi = (cap) => {
    selectedCap = String(cap || '10');
    capRow?.querySelectorAll('.peepal-cap-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.cap === selectedCap);
    });
    if (capHint) {
      capHint.textContent = selectedCap === '50'
        ? 'Maximum free cap. Add Chaupaal Money or join Pradhan / Sarpanch for more.'
        : `Your post will stop collecting new responses after ${selectedCap}.`;
    }
  };
  capRow?.querySelectorAll('.peepal-cap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cap = btn.dataset.cap;
      const isPro = btn.classList.contains('peepal-cap-btn--pro');
      if (isPro) {
        if (typeof openProUpsell === 'function') openProUpsell('response_cap');
        else if (typeof showToast === 'function') showToast('Higher response caps coming with Pro ✦');
        return;
      }
      setCapUi(cap);
    });
  });

  const qText=document.getElementById('peepalQText');
  const audienceSel=document.getElementById('peepalAudience');
  let peepalDraft=null;
  if(typeof bindDraftAutosave==='function'){
    peepalDraft=bindDraftAutosave({
      name:'peepal',
      fields:[qText,audienceSel,document.getElementById('mcqOpt1'),document.getElementById('mcqOpt2'),document.getElementById('mcqOpt3'),document.getElementById('mcqOpt4')],
      getState:()=>({
        question:qText?.value||'',
        audience:audienceSel?.value||'everyone',
        format:sheet.querySelector('.peepal-format-chip.active')?.dataset.fmt||'open',
        opts:[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||''),
        attachments: composeAttachments.map((a) => ({ type: a.type, label: a.label || a.name || a.type })),
        responseCap: selectedCap,
      }),
      applyState:(s)=>{
        if(qText&&s.question) qText.value=s.question;
        if(audienceSel&&s.audience) audienceSel.value=s.audience;
        (s.opts||[]).forEach((v,i)=>{ const el=document.getElementById(`mcqOpt${i+1}`); if(el&&v) el.value=v; });
        if(s.format){
          const chip=sheet.querySelector(`.peepal-format-chip[data-fmt="${s.format}"]`);
          chip?.click();
        }
        setCapUi(s.responseCap || '10');
      },
    });
  }
  setCapUi('10');

  if (isEdit) {
    const qTextEl = document.getElementById('peepalQText');
    if (qTextEl) qTextEl.value = String(editPost.question || '');
    const fmt = editPost.format || 'open';
    sheet.querySelector(`.peepal-format-chip[data-fmt="${fmt}"]`)?.click();
    (editPost.options || []).forEach((v, i) => {
      const el = document.getElementById(`mcqOpt${i + 1}`);
      if (el && v) el.value = v;
    });
    const aud = document.getElementById('peepalAudience');
    if (aud) {
      aud.value = editPost.saveOnly ? 'save_only' : (editPost.audience || 'everyone');
    }
    if (editPost.responseCap != null) setCapUi(String(editPost.responseCap));
    if (Array.isArray(editPost.attachments)) {
      composeAttachments = editPost.attachments.map((a) => ({ ...a }));
      renderAttachPreview();
    }
    if (editPost.attachment?.type) {
      composeAttachments.push({ type: editPost.attachment.type, label: editPost.attachment.type, ...editPost.attachment });
      renderAttachPreview();
    }
    peepalAskCat = editPost.tag && editPost.tag !== (editPost.format || 'open').toUpperCase() ? editPost.tag : '';
  }

  document.getElementById('closeAsk').addEventListener('click',()=>{
    peepalDraft?.flush?.();
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    try{ if(typeof restoreAppShell==='function') restoreAppShell('peepal_ask_close'); }catch(e){}
  });

  document.getElementById('peepalPublishBtn').addEventListener('click',async()=>{
    const text=qText.value.trim();
    if(!text){showToast('Write something to start a discussion');return;}
    const unlock=typeof beginClientMutation==='function'?beginClientMutation(isEdit?'peepal_edit':'peepal_post'):()=>{};
    if(unlock===false){ showToast(t('peepal_post_submitting')); return; }
    const pubBtn=document.getElementById('peepalPublishBtn');
    const pubLabel=pubBtn?pubBtn.textContent:'';
    if(pubBtn){
      if(typeof setButtonLoading==='function') setButtonLoading(pubBtn, true);
      else { pubBtn.disabled=true; pubBtn.textContent=isEdit?'Saving…':'Posting…'; }
    }
    try{
    if(isEdit){
      if(!db||!currentUser||!editId){
        showToast(t('peepal_sign_in_post'));
        return;
      }
      if(editPost.uid&&editPost.uid!==currentUser.uid){
        showToast('Not authorized');
        return;
      }
      const fmt=sheet.querySelector('.peepal-format-chip.active')?.dataset.fmt||'open';
      const opts=fmt==='poll'?[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||'').filter(Boolean):[];
      const audience=document.getElementById('peepalAudience')?.value||'everyone';
      const saveOnly=audience==='save_only';
      const updatePayload={
        question:text,
        format:fmt,
        options:opts,
        responses:opts.length?(editPost.responses||[]).slice(0,opts.length).concat(opts.map((_,i)=>(editPost.responses||[])[i]||0)).slice(0,opts.length):[],
        tag:peepalAskCat||fmt.toUpperCase(),
        audience:saveOnly?'private':audience,
        responseCap:selectedCap,
        archived:!!saveOnly,
        saveOnly:!!saveOnly,
        attachments: composeAttachments.map((a) => ({ ...a, blob: undefined, file: undefined })),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      };
      if(editPost.attachment?.type==='image'&&!composeAttachments.some(a=>a.type==='photo'||a.type==='image')){
        updatePayload.attachment=editPost.attachment;
      }
      await db.collection('peepal').doc(editId).update(updatePayload);
      const idx=peepalQuestions.findIndex(q=>(q.firestoreId||q.id)===editId);
      const merged={...editPost,...updatePayload,id:editId,firestoreId:editId,question:text,format:fmt,options:opts};
      if(idx>=0) peepalQuestions[idx]=merged;
      peepalDraft?.clear?.();
      composeAttachments=[];
      renderAttachPreview();
      sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
      renderPeepalFeed();
      try{ document.dispatchEvent(new CustomEvent('chaupaal:profile-posts-changed')); }catch(e){}
      showToast('Discussion updated');
      return;
    }
    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('post');
      if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||t('peepal_slow_down')); return; }
    }
    const quota=await checkPeepalQuota();
    if(!quota.ok){
      showToast(quota.unlock||t('peepal_weekly_limit'));
      if(typeof ChaupaalMoney?.openMembership==='function') ChaupaalMoney.openMembership();
      return;
    }
    const wantsAnon=!!document.getElementById('anonToggle')?.checked;
    let isAnon=false;
    // Check anon quota before build/write, but consume ONLY after Firestore
    // succeeds â€” otherwise a denied write still burns a scarce slot.
    if(wantsAnon){
      try{
        anonQuota = await getAnonRemaining();
        if(anonQuota.exhausted || anonQuota.readFailed){
          showToast(anonQuota.unlock||t('peepal_anon_limit'));
          return;
        }
        isAnon=true;
      }catch(e){
        showToast(t('peepal_anon_verify_fail'));
        return;
      }
    }
    const fmt=sheet.querySelector('.peepal-format-chip.active')?.dataset.fmt||'open';
    const opts=fmt==='poll'?[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||'').filter(Boolean):[];
    const audience=document.getElementById('peepalAudience')?.value||'everyone';
    const saveOnly=audience==='save_only';
    // SECURITY: even anonymous posts must carry the real auth uid on user.uid —
    // Firestore create rules require user.uid == auth.uid (Phase A). Display
    // name/avatar stay anonymous; only the public label changes.
    const ownUid=currentUser?.uid||'me';
    const q={id:`q_${Date.now()}`,question:text,format:fmt,options:opts,responses:opts.map(()=>0),totalResponses:0,comments:0,timeAgo:'just now',ts:Date.now(),tag:peepalAskCat||fmt.toUpperCase(),answered:false,deleted:false,
      audience:saveOnly?'private':audience, responseLimitMode:'manual', responseCap:selectedCap, audienceSegments:[],
      segmentDistributionActive:false,
      activeSegmentIndex:0,
      archived:!!saveOnly,
      saveOnly:!!saveOnly,
      user:isAnon
        ?{name:'Anonymous',avatar:'🎭',uid:ownUid,profileType:'personal'}
        :{name:userProfile?.name||'You',avatar:userProfile?.photoURL||'🪑',uid:ownUid,photoURL:userProfile?.photoURL||null,profileType:(typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal'))},
      anonymous:isAnon,uid:ownUid};
    q.attachments = composeAttachments.map((a) => ({ ...a, blob: undefined, file: undefined }));

    // Optional image attachment (compressed to Storage)
    if(typeof pendingPeepalAttachment!=='undefined'&&pendingPeepalAttachment?.type==='image'&&pendingPeepalAttachment.file&&!isAnon){
      try{
        if(typeof uploadOptimizedImage==='function'&&currentUser&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
          const up=await uploadOptimizedImage(pendingPeepalAttachment.file,{folder:'peepal'});
          q.attachment={
            type:'image',
            data:up.media,
            thumb:up.thumb,
            mediaPath:up.mediaPath,
            thumbPath:up.thumbPath,
            width:Number(up.width)||null,
            height:Number(up.height)||null,
          };
        } else if(pendingPeepalAttachment.data){
          q.attachment={type:'image',data:pendingPeepalAttachment.data};
        }
      }catch(e){
        showToast(typeof friendlyError==='function'?friendlyError(e):t('peepal_image_fail'));
      }
      pendingPeepalAttachment=null;
    } else if(typeof pendingPeepalAttachment!=='undefined'&&pendingPeepalAttachment?.type==='link'){
      q.attachment=pendingPeepalAttachment;
      pendingPeepalAttachment=null;
    }

    if(db&&currentUser){
      try{
        if(typeof assertOwnUid==='function'&&!assertOwnUid(currentUser.uid)) throw new Error('Not authorized');
        const ref=await db.collection('peepal').add({
          question:q.question,format:q.format,options:q.options,responses:q.responses,
          totalResponses:0,comments:0,tag:q.tag,user:q.user,anonymous:!!isAnon,
          uid:currentUser.uid,deleted:false,
          audience:q.audience||'everyone',
          responseLimitMode:q.responseLimitMode||'algorithm',
          responseCap:q.responseCap??null,
          audienceSegments:q.audienceSegments||[],
          segmentDistributionActive:!!q.segmentDistributionActive,
          activeSegmentIndex:0,
          archived:!!saveOnly,
          archivedAt:saveOnly?firebase.firestore.FieldValue.serverTimestamp():null,
          saveOnly:!!saveOnly,
          attachment: q.attachment?.type==='image'
            ? {
                type:'image',
                data:q.attachment.data,
                thumb:q.attachment.thumb||null,
                width:q.attachment.width||null,
                height:q.attachment.height||null,
              }
            : (q.attachment?.type==='link'?q.attachment:null),
          createdAt:firebase.firestore.FieldValue.serverTimestamp(),ts:Date.now(),
          attachments: q.attachments || [],
        });
        q.firestoreId=ref.id;
        q.id=ref.id;
        // Consume after successful write so a rules/network failure never burns a slot
        if(!saveOnly && typeof PolicyUsage?.consume==='function'){
          try{ await PolicyUsage.consume('peepalPost'); }
          catch(qe){
            if(typeof reportClientError==='function'){
              reportClientError({feature:'peepal_post_consume',message:qe?.message||String(qe)});
            }
          }
        }
        if(isAnon){
          try{ await PolicyUsage.consume('anon'); }
          catch(qe){
            if(typeof reportClientError==='function'){
              reportClientError({feature:'peepal_anon_consume',message:qe?.message||String(qe)});
            }
          }
        }
      }catch(e){
        if(typeof reportClientError==='function'){
          reportClientError({feature:'peepal_create',message:e?.message||String(e),stack:e?.stack||''});
        }
        showToast(
          e?.code==='DAILY_LIMIT'||e?.code==='WEEKLY_LIMIT'
            ?(anonQuota?.unlock||t('peepal_anon_limit'))
            :e?.code==='QUOTA_UNAVAILABLE'
            ?t('peepal_quota_verify_fail')
            :(typeof friendlyError==='function'?friendlyError(e):t('peepal_post_fail'))
        );
        return;
      }
    } else if(!db||!currentUser){
      showToast(t('peepal_sign_in_post'));
      return;
    }
    if(!saveOnly) peepalQuestions.unshift(q);
    peepalDraft?.clear?.();
    composeAttachments = [];
    renderAttachPreview();
    saveToArchive({type:'peepal_post',...q});
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    renderPeepalFeed();
      if(typeof trackPostCreated==='function') trackPostCreated(isAnon?'peepal_anon':'peepal');
      if(typeof SoundLib!=='undefined'&&SoundLib.postPublish) SoundLib.postPublish();
      showToast(saveOnly?t('peepal_saved_archive'):(isAnon?t('peepal_posted_anon'):t('peepal_posted')), 3000, { type: 'success' });
    }finally{
      if(pubBtn){
        if(typeof setButtonLoading==='function') setButtonLoading(pubBtn, false);
        else { pubBtn.disabled=false; pubBtn.textContent=pubLabel; }
      }
      if(typeof unlock==='function') unlock();
    }
  });

  const toolbar = document.getElementById('peepalComposeToolbar');
  toolbar?.querySelectorAll('[data-attach]').forEach((btn) => btn.addEventListener('click', () => handleAttach(btn.dataset.attach)));
  document.getElementById('peepalAttachMore')?.addEventListener('click', renderAttachGrid);
  document.getElementById('peepalPhotoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'photo', label: `📷 ${file.name}`, file, preview: URL.createObjectURL(file) });
  });
  document.getElementById('peepalVideoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'video', label: `🎬 ${file.name}`, file });
  });
  document.getElementById('peepalAudioInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'music', label: `🎵 ${file.name}`, file });
  });
  document.getElementById('peepalDocInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    addAttachment({ type: 'document', label: `📄 ${file.name}`, file });
  });
  document.getElementById('peepalCollabAdd')?.addEventListener('click', () => {
    const input = document.getElementById('peepalCollabInput');
    const raw = String(input?.value || '').trim();
    if (!raw) return;
    addAttachment({ type: 'collab', label: `🤝 @${raw}`, collaborator: { uid: '', name: raw, username: raw.replace(/^@/, '') } });
    if (input) input.value = '';
  });
  const addLink = async () => {
    const input = document.getElementById('peepalLinkInput');
    const url = String(input?.value || '').trim();
    if (!/^https:\/\//i.test(url) || /javascript:/i.test(url)) {
      if (typeof showToast === 'function') showToast('Use an https link');
      return;
    }
    let title = url.replace(/^https:\/\//i, '');
    try {
      if (typeof apiFetch === 'function') {
        const env = await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: { action: 'link_preview', url },
        });
        const data = env?.data || env || {};
        title = data.title || data.siteName || title;
      }
    } catch (e) {}
    addAttachment({ type: 'link', label: `🔗 ${String(title).slice(0, 42)}`, url, title: String(title).slice(0, 120) });
    if (input) input.value = '';
  };
  document.getElementById('peepalLinkAdd')?.addEventListener('click', addLink);
  document.getElementById('peepalLinkInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLink();
    }
  });

  wireAiKbToInput(document.getElementById('peepalQText'),'Composing a Peepal question for the community');
  setTimeout(()=>{
    if(typeof wirePeepalAttachments==='function') wirePeepalAttachments(sheet);
    if(typeof wirePeepalAskAiTarget==='function') wirePeepalAskAiTarget();
  }, 50);
}

function openPeepalEditSheet(post){
  if(!post) return;
  openPeepalAskSheet(post);
}
window.openPeepalEditSheet=openPeepalEditSheet;

