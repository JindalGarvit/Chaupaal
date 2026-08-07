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
    if (typeof AiDiscoveryMeter?.mountOnIntentCard === 'function') {
      AiDiscoveryMeter.mountOnIntentCard(document.getElementById('peepalIntentCard'), { disclosePro: true });
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
          ${user.photoURL?`<img src="${esc(user.photoURL)}" style="width:100%;height:100%;object-fit:cover;">`:user.avatar||'👤'}
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
  if(!statusData) return '';
  if(statusData.online) return '<span style="color:#2ECC71;font-size:11px;font-weight:700;">â— Online</span>';
  const lastSeen = statusData.lastSeen?.toDate?.() || new Date(statusData.lastSeen||0);
  const rel = typeof formatRelativeTime==='function'
    ? formatRelativeTime(lastSeen)
    : lastSeen.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  return `<span style="color:var(--muted);font-size:11px;">last seen ${rel.toLowerCase()}</span>`;
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

function openPeepalAskSheet(){
  const sheet = document.createElement('div');
  sheet.className = 'peepal-ask-sheet';
  const lim = window.PolicyLimits?.ANON_POSTS || { perDay: 2, perWeek: 7 };
  sheet.innerHTML=`
    <div class="ask-header">
      <button id="closeAsk" aria-label="Close" style="background:none;border:none;cursor:pointer;padding:8px;color:var(--ink);">${typeof iconHtml==='function'?iconHtml('x',{size:22}):'âœ•'}</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">Ask Peepal</div>
      <button class="btn btn--primary btn--sm peepal-ask-publish-btn" id="peepalPublishBtn">Post</button>
    </div>
    <div style="padding:16px;">
      <!-- Anonymous toggle (filled after quota load) -->
      <div id="anonToggleRow" style="background:var(--line);border:2px solid var(--line);border-radius:14px;padding:12px;margin-bottom:16px;display:flex;align-items:center;gap:12px;opacity:0.5;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">ðŸŽ­ Post anonymously</div>
          <div id="anonToggleHint" style="font-size:11px;color:var(--muted);">Checking availabilityâ€¦</div>
        </div>
        <label class="switch" id="anonToggleLabel" style="pointer-events:none;"><input type="checkbox" id="anonToggle" disabled><span class="slider"></span></label>
      </div>
      <!-- Format -->
      <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;">
        ${[{id:'mcq',label:'ðŸ“‹ MCQ'},{id:'binary',label:'âš–ï¸ Binary'},{id:'open',label:'ðŸ’¬ Open'},{id:'poll',label:'ðŸ“Š Poll'}].map((f,i)=>`<button class="peepal-format-chip${i===0?' active':''}" data-fmt="${f.id}" style="padding:8px 14px;border-radius:999px;border:2px solid ${i===0?'var(--red)':'var(--line)'};background:${i===0?'rgba(230,57,70,0.08)':'var(--white)'};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;color:${i===0?'var(--red)':'var(--ink)'};">${f.label}</button>`).join('')}
      </div>
      <textarea id="peepalQText" placeholder="What do you want to know?" style="width:100%;min-height:100px;border:2px solid var(--line);border-radius:14px;padding:12px;font-family:Inter,sans-serif;font-size:15px;outline:none;resize:none;box-sizing:border-box;background:var(--cream);"></textarea>
      <!-- MCQ options -->
      <div id="mcqOptions" style="margin-top:10px;">
        ${[1,2,3,4].map(i=>`<input id="mcqOpt${i}" placeholder="Option ${i}${i>2?' (optional)':''}" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;outline:none;margin-bottom:8px;box-sizing:border-box;background:var(--white);">`).join('')}
      </div>
      <!-- Audience -->
      <div style="margin-top:8px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Audience</div>
        <select id="peepalAudience" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;">
          <option value="everyone">ðŸŒ Everyone</option>
          <option value="friends">ðŸ‘¥ Friends only</option>
          <option value="ai">ðŸ¤– AI decides</option>
          <option value="save_only">ðŸ’¾ Save without posting</option>
        </select>
      </div>
      <!-- Response limits -->
      <div style="margin-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Responses wanted</div>
        <select id="peepalResponseCap" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;background:var(--white);outline:none;">
          <option value="algorithm">Let the algorithm decide</option>
          <option value="10">10 responses</option>
          <option value="50">50 responses</option>
          <option value="100">100 responses</option>
          <option value="custom">Custom numberâ€¦</option>
        </select>
        <input id="peepalCustomCap" type="number" min="1" max="5000" placeholder="Custom cap" style="display:none;width:100%;margin-top:8px;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;box-sizing:border-box;background:var(--white);">
      </div>
      <!-- Cascading audience segments -->
      <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Audience segments (cascade)</div>
          <button type="button" id="peepalAddSegment" style="background:none;border:none;color:var(--red);font-weight:700;font-size:12px;cursor:pointer;">+ Add</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.35;">Segment 1 fills first. When it hits its cap or engagement stalls, the next segment starts automatically â€” no prompt. Add as many as you need (soft limit 15).</div>
        <div id="peepalSegmentsList"></div>
      </div>
      <!-- Nudge templates -->
      <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;">âœ¨ Quick templates</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${PEEPAL_NUDGES.slice(0,6).map(n=>`<button class="peepal-template-chip" data-template="${n.template.replace(/"/g,'&quot;')}" style="padding:6px 11px;background:var(--cream);border:1.5px solid var(--line);border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;">${n.icon} ${n.label}</button>`).join('')}
        </div>
      </div>
    </div>
  `;
  document.querySelector('.device').appendChild(sheet);
  requestAnimationFrame(()=>sheet.classList.add('open'));
  if(typeof pushNavLayer==='function'){
    sheet.dataset.navManaged='1';
    pushNavLayer(sheet,()=>{ sheet.classList.remove('open'); setTimeout(()=>sheet.remove(),350); });
  }

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
      hint.textContent = `${anonQuota.dayLeft} anonymous left today Â· ${anonQuota.weekLeft} this week (max ${lim.perDay}/day, ${lim.perWeek}/week)`;
      label.style.pointerEvents = '';
      toggle.disabled = false;
    } else {
      row.style.background = 'var(--line)';
      row.style.borderColor = 'var(--line)';
      row.style.opacity = '0.5';
      hint.textContent = anonQuota.readFailed
        ? (anonQuota.unlock || 'Couldnâ€™t verify anonymous limit â€” try again shortly.')
        : (anonQuota.unlock || 'Anonymous posting unavailable right now.');
      label.style.pointerEvents = 'none';
      toggle.disabled = true;
      toggle.checked = false;
    }
  })();

  // Segment builder state
  let segmentDrafts=[{label:'Segment 1',city:'',gender:'any',intent:'any',capMode:'inherit'}];
  const segList=document.getElementById('peepalSegmentsList');
  function renderSegments(){
    if(!segList) return;
    segList.innerHTML=segmentDrafts.map((s,i)=>`
      <div class="peepal-seg-row" data-seg="${i}" style="background:var(--cream);border-radius:12px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:12px;">${i+1}. ${s.label||'Segment'}</strong>
          ${segmentDrafts.length>1?`<button type="button" data-seg-remove="${i}" style="border:none;background:none;color:var(--muted);cursor:pointer;">âœ•</button>`:''}
        </div>
        <input data-seg-city="${i}" placeholder="City (optional)" value="${(s.city||'').replace(/"/g,'&quot;')}" style="width:100%;padding:8px 10px;border:1.5px solid var(--line);border-radius:10px;font-size:12px;margin-bottom:6px;box-sizing:border-box;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <select data-seg-gender="${i}" style="flex:1;min-width:90px;padding:8px;border-radius:10px;border:1.5px solid var(--line);font-size:12px;">
            <option value="any" ${s.gender==='any'?'selected':''}>Any gender</option>
            <option value="female" ${s.gender==='female'?'selected':''}>Female</option>
            <option value="male" ${s.gender==='male'?'selected':''}>Male</option>
          </select>
          <select data-seg-intent="${i}" style="flex:1;min-width:90px;padding:8px;border-radius:10px;border:1.5px solid var(--line);font-size:12px;">
            <option value="any">Any intent</option>
            <option value="dating" ${s.intent==='dating'?'selected':''}>Dating</option>
            <option value="friendship" ${s.intent==='friendship'?'selected':''}>Friendship</option>
            <option value="hobby" ${s.intent==='hobby'?'selected':''}>Hobby</option>
            <option value="travel" ${s.intent==='travel'?'selected':''}>Travel</option>
            <option value="gaming" ${s.intent==='gaming'?'selected':''}>Gaming</option>
          </select>
          <select data-seg-cap="${i}" style="flex:1;min-width:90px;padding:8px;border-radius:10px;border:1.5px solid var(--line);font-size:12px;">
            <option value="inherit">Same as post</option>
            <option value="10" ${s.capMode==='10'?'selected':''}>Cap 10</option>
            <option value="50" ${s.capMode==='50'?'selected':''}>Cap 50</option>
            <option value="100" ${s.capMode==='100'?'selected':''}>Cap 100</option>
          </select>
        </div>
      </div>`).join('');
    segList.querySelectorAll('[data-seg-remove]').forEach(btn=>btn.addEventListener('click',()=>{
      segmentDrafts.splice(Number(btn.dataset.segRemove),1);
      renderSegments();
    }));
    segList.querySelectorAll('[data-seg-city]').forEach(el=>el.addEventListener('input',()=>{ segmentDrafts[Number(el.dataset.segCity)].city=el.value; }));
    segList.querySelectorAll('[data-seg-gender]').forEach(el=>el.addEventListener('change',()=>{ segmentDrafts[Number(el.dataset.segGender)].gender=el.value; }));
    segList.querySelectorAll('[data-seg-intent]').forEach(el=>el.addEventListener('change',()=>{ segmentDrafts[Number(el.dataset.segIntent)].intent=el.value; }));
    segList.querySelectorAll('[data-seg-cap]').forEach(el=>el.addEventListener('change',()=>{ segmentDrafts[Number(el.dataset.segCap)].capMode=el.value; }));
  }
  renderSegments();
  document.getElementById('peepalAddSegment')?.addEventListener('click',()=>{
    if(segmentDrafts.length>=15){ showToast(t('peepal_segment_limit')); return; }
    segmentDrafts.push({label:`Segment ${segmentDrafts.length+1}`,city:'',gender:'any',intent:'any',capMode:'inherit'});
    renderSegments();
  });
  document.getElementById('peepalResponseCap')?.addEventListener('change',(e)=>{
    const custom=document.getElementById('peepalCustomCap');
    if(custom) custom.style.display=e.target.value==='custom'?'block':'none';
  });

  // Wire template chips
  sheet.querySelectorAll('.peepal-template-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{document.getElementById('peepalQText').value=chip.dataset.template;});
  });

  // Wire format chips
  sheet.querySelectorAll('.peepal-format-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      sheet.querySelectorAll('.peepal-format-chip').forEach(c=>{c.classList.remove('active');c.style.borderColor='var(--line)';c.style.background='var(--white)';c.style.color='var(--ink)';});
      chip.classList.add('active');chip.style.borderColor='var(--red)';chip.style.background='rgba(230,57,70,0.08)';chip.style.color='var(--red)';
      document.getElementById('mcqOptions').style.display=(chip.dataset.fmt==='mcq'||chip.dataset.fmt==='poll')?'block':'none';
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
      }),
      applyState:(s)=>{
        if(qText&&s.question) qText.value=s.question;
        if(audienceSel&&s.audience) audienceSel.value=s.audience;
        (s.opts||[]).forEach((v,i)=>{ const el=document.getElementById(`mcqOpt${i+1}`); if(el&&v) el.value=v; });
        if(s.format){
          const chip=sheet.querySelector(`.peepal-format-chip[data-fmt="${s.format}"]`);
          chip?.click();
        }
      },
    });
  }

  document.getElementById('closeAsk').addEventListener('click',()=>{
    peepalDraft?.flush?.();
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    try{ if(typeof restoreAppShell==='function') restoreAppShell('peepal_ask_close'); }catch(e){}
  });

  document.getElementById('peepalPublishBtn').addEventListener('click',async()=>{
    const text=qText.value.trim();
    if(!text){showToast(t('peepal_write_question'));return;}
    const unlock=typeof beginClientMutation==='function'?beginClientMutation('peepal_post'):()=>{};
    if(unlock===false){ showToast(t('peepal_post_submitting')); return; }
    const pubBtn=document.getElementById('peepalPublishBtn');
    const pubLabel=pubBtn?pubBtn.textContent:'';
    if(pubBtn){ pubBtn.disabled=true; pubBtn.textContent='Postingâ€¦'; }
    try{
    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('post');
      if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||t('peepal_slow_down')); return; }
    }
    const quota=await checkPeepalQuota();
    if(!quota.ok){showToast(quota.unlock||t('peepal_weekly_limit'));return;}
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
    const opts=fmt==='mcq'||fmt==='poll'?[1,2,3,4].map(i=>document.getElementById(`mcqOpt${i}`)?.value||'').filter(Boolean):[];
    const audience=document.getElementById('peepalAudience')?.value||'everyone';
    const saveOnly=audience==='save_only';
    const responseLimitMode=document.getElementById('peepalResponseCap')?.value||'algorithm';
    const customCap=Number(document.getElementById('peepalCustomCap')?.value)||null;
    const resolveCapLocal=(mode,custom)=>{
      if(mode==='algorithm') return null;
      if(mode==='custom') return Math.max(1,Math.min(5000,Number(custom)||50));
      const n=Number(mode); return Number.isFinite(n)?n:null;
    };
    const postCap=resolveCapLocal(responseLimitMode, customCap);
    const audienceSegments=segmentDrafts.map((s,i)=>({
      id:`seg_${i+1}`,
      order:i,
      label:s.label||`Segment ${i+1}`,
      criteria:{
        city:s.city||null,
        gender:s.gender||'any',
        searchIntent:s.intent||'any',
        interests:[],
        ageRange:{min:null,max:null},
        personality:null,
        vibe:'',
      },
      cap:s.capMode==='inherit'?postCap:resolveCapLocal(s.capMode,null),
      fulfilledCount:0,
      viewsShown:0,
      responsesInWindow:0,
      windowStartedAt:null,
      status:i===0?'active':'pending',
      activatedAt:i===0?Date.now():null,
      completedAt:null,
      stallReason:null,
    }));
    // SECURITY: even anonymous posts must carry the real auth uid on user.uid â€”
    // Firestore create rules require user.uid == auth.uid (Phase A). Display
    // name/avatar stay anonymous; only the public label changes.
    const ownUid=currentUser?.uid||'me';
    const q={id:`q_${Date.now()}`,question:text,format:fmt,options:opts,responses:opts.map(()=>0),totalResponses:0,comments:0,timeAgo:'just now',ts:Date.now(),tag:fmt.toUpperCase(),answered:false,deleted:false,
      audience:saveOnly?'private':audience, responseLimitMode, responseCap:postCap, audienceSegments:saveOnly?[]:audienceSegments,
      segmentDistributionActive:!saveOnly && audienceSegments.some(s=>s.status==='active'),
      activeSegmentIndex:0,
      archived:!!saveOnly,
      saveOnly:!!saveOnly,
      user:isAnon
        ?{name:'Anonymous',avatar:'ðŸŽ­',uid:ownUid,profileType:'personal'}
        :{name:userProfile?.name||'You',avatar:userProfile?.photoURL||'ðŸª‘',uid:ownUid,photoURL:userProfile?.photoURL||null,profileType:(typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal'))},
      anonymous:isAnon,uid:ownUid};

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
        });
        q.firestoreId=ref.id;
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
    saveToArchive({type:'peepal_post',...q});
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    renderPeepalFeed();
      if(typeof trackPostCreated==='function') trackPostCreated(isAnon?'peepal_anon':'peepal');
      if(typeof SoundLib!=='undefined'&&SoundLib.postPublish) SoundLib.postPublish();
      showToast(saveOnly?t('peepal_saved_archive'):(isAnon?t('peepal_posted_anon'):t('peepal_posted')));
    }finally{
      if(pubBtn){ pubBtn.disabled=false; pubBtn.textContent=pubLabel; }
      if(typeof unlock==='function') unlock();
    }
  });

  wireAiKbToInput(document.getElementById('peepalQText'),'Composing a Peepal question for the community');
  setTimeout(()=>{
    if(typeof wirePeepalAttachments==='function') wirePeepalAttachments(sheet);
    if(typeof wirePeepalAskAiTarget==='function') wirePeepalAskAiTarget();
  }, 50);
}

