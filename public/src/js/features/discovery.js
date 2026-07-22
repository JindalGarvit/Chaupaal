// ===================== PEEPAL AI PEOPLE SEARCH =====================

const PEEPAL_SEARCH_NUDGES = [
  {emoji:'❤️', text:'Looking for someone to date?', hint:'Type something like "someone fun around 25 who loves movies and travel"'},
  {emoji:'🤝', text:'Want new friends?', hint:'Try "cricket fan from Delhi who likes startups"'},
  {emoji:'💼', text:'Hiring or job hunting?', hint:'Try "frontend developer looking for opportunities" or "hiring designers"'},
  {emoji:'✈️', text:'Planning a trip?', hint:'Try "travel buddy for Ladakh in December"'},
  {emoji:'🎮', text:'Find a game partner', hint:'Try "someone to play chess or word games with"'},
  {emoji:'🎵', text:'Bond over music', hint:'Try "Bollywood music lover who also likes jazz"'},
  {emoji:'📚', text:'Start a book club', hint:'Try "non-fiction reader interested in history"'},
  {emoji:'🏋️', text:'Find a fitness buddy', hint:'Try "morning runner or gym person in Bangalore"'},
  {emoji:'🍛', text:'Foodie connections', hint:'Try "food lover who likes trying new restaurants"'},
  {emoji:'🧠', text:'Intellectual debates', hint:'Try "someone who loves discussing politics, philosophy or science"'},
  {emoji:'🎬', text:'Movie or series partner', hint:'Try "thriller movie buff who watches OTT"'},
  {emoji:'🚀', text:'Find a co-founder', hint:'Try "startup-minded person with product sense"'},
];

// Intent → criteria mapping (no API call needed for common patterns)
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

async function runPeepalAiSearch(){
  const input = document.getElementById('peepalAiSearchInput');
  const query = input?.value.trim();
  if(!query) return;
  const resultsEl = document.getElementById('peepalAiSearchResults');
  if(!resultsEl) return;

  if(typeof renderSkeleton==='function') renderSkeleton(resultsEl, {variant:'card', count:2});
  else resultsEl.innerHTML = `<div class="peepal-ai-thinking">Finding the right people for you...</div>`;

  try{
    // Step 1: Fast intent detection (local, no API call)
    const queryLower = query.toLowerCase();
    let quickCriteria = null;
    for(const [intent, criteria] of Object.entries(INTENT_MAP)){
      if(queryLower.includes(intent)){quickCriteria = {...criteria, detectedIntent: intent};break;}
    }

    // Step 2: LLM intent parse (skipped when master AI kill-switch is off — use local INTENT_MAP)
    let criteria = {interests:[],ageRange:{min:null,max:null},gender:'any',city:null,personality:null,searchIntent:'any',vibe:'',conversationStarter:''};
    if(quickCriteria){
      criteria = {...criteria, ...quickCriteria, searchIntent: quickCriteria.detectedIntent || 'any'};
    }
    const aiOn = typeof isAiFeaturesEnabled === 'function' ? await isAiFeaturesEnabled() : false;
    if(aiOn){
      try{
        const parseData = await callAI({
          tier:'fast', max_tokens:500, feature:'peepal_ai_search',
          system:`You are an expert people-matching AI for Chaupaal, India's social discovery app. Understand what kind of person the user wants to meet — go beyond literal words to understand real intent.

INTENT EXAMPLES:
- "dating" / "someone special" / "romantic" → searchIntent: dating, prioritize opposite gender, similar age
- "startup person" / "entrepreneur" → interests: Business, Tech; personality: intellectual  
- "cricket lover" / "sports fan" → interests: Sports
- "travel buddy" / "someone to explore with" → personality: outdoorsy; interests include travel
- "book club" / "reader" → personality: intellectual
- "foodies" / "eating out" → interests: food
- "gym partner" / "fitness" → personality: outdoorsy
- "movie buff" / "web series" → personality: cinephile
- "debate" / "philosophy" / "politics" → personality: intellectual; interests: GK, World
- "music lover" → interests: Music
- "co-founder" / "collaboration" → interests: Business, Tech; personality: intellectual
- "job hunting" / "hiring" → interests: Business, Tech

Return ONLY valid JSON:
{
  "interests": ["array of Chaupaal categories: GK, Sports, Tech, Business, India, World, Music, Food, Travel, Movies"],
  "ageRange": {"min": number|null, "max": number|null},
  "gender": "male"|"female"|"any",
  "city": "city name"|null,
  "personality": "intellectual"|"outdoorsy"|"cinephile"|"social"|null,
  "searchIntent": "dating"|"friendship"|"recruitment"|"hobby"|"travel"|"gaming"|"any",
  "vibe": "one line describing ideal match",
  "conversationStarter": "a natural opening message they could send to match"
}`,
          messages:[{role:'user', content: query}]
        });
        try{
          const raw = parseData.content?.[0]?.text || parseData.text || '{}';
          const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
          criteria = {...criteria, ...parsed};
          if(quickCriteria){
            criteria.interests = [...new Set([...(criteria.interests||[]),...(quickCriteria.interests||[])])];
            if(!criteria.personality && quickCriteria.personality) criteria.personality = quickCriteria.personality;
            if(criteria.searchIntent==='any' && quickCriteria.detectedIntent) criteria.searchIntent = quickCriteria.detectedIntent;
          }
        }catch(e){}
      }catch(e){ /* kill-switch / network — keep local criteria */ }
    }

    // Step 3: Score all available profiles
    const pool = [...SAMPLE_DISCOVERY_POOL];
    if(db && currentUser){
      try{
        const snap = await db.collection('users').where('openToMeet','==',true).limit(40).get();
        snap.docs.forEach(d=>{
          const u=d.data();
          if((u.uid||d.id)!==currentUser.uid&&u.name){
            pool.push({
              ...u,
              uid:u.uid||d.id,
              icebreakers: typeof resolveIcebreakersFromUser==='function'
                ? resolveIcebreakersFromUser(u)
                : (u.icebreakers||u.profile?.icebreakers||[]),
            });
          }
        });
      }catch(e){}
    }

    const myProfile = userProfile || {};
    const myGender = myProfile.gender || digitalProfile.gender;

    const scored = pool.filter(u => !dismissedUids.has(u.uid)).map(u=>{
      let score = 0;
      const reasons = [];
      const theirInterests = new Set([...(u.interests||[]),...(u.topCat?[u.topCat]:[])].map(i=>i.toLowerCase()));

      // Interest matching — flexible, includes synonyms
      const interestAliases = {
        'sports':['cricket','football','badminton','tennis','sports'],
        'tech':['technology','software','programming','coding','startup','tech'],
        'business':['business','finance','startup','entrepreneur','economics'],
        'music':['music','songs','bands','concerts','bollywood'],
        'food':['food','cooking','restaurants','chef','cuisine'],
        'travel':['travel','trips','adventure','explore','trekking'],
        'movies':['movies','films','cinema','series','ott','netflix'],
        'gk':['gk','knowledge','quiz','trivia','current affairs'],
        'india':['india','indian','politics','news','current events'],
        'world':['world','international','global','geopolitics'],
      };

      (criteria.interests||[]).forEach(ci=>{
        const ciLower = ci.toLowerCase();
        const aliases = interestAliases[ciLower] || [ciLower];
        const matched = aliases.some(alias => [...theirInterests].some(ti => ti.includes(alias) || alias.includes(ti)));
        if(matched){score+=20; if(reasons.length<3) reasons.push(ci);}
      });

      // Dating intent: strong opposite-gender boost
      if(criteria.searchIntent==='dating'){
        const oppositeGender = myGender==='male'?'female':myGender==='female'?'male':null;
        if(oppositeGender && u.gender===oppositeGender){score+=30;reasons.push('Your type');}
        else if(!oppositeGender){score+=15;}
        // Age proximity crucial for dating
        if(u.age && myProfile.age){
          const diff = Math.abs(u.age - myProfile.age);
          score += Math.max(0, 20 - diff*3);
        }
      }

      // Friendship / general: personality & city matter more
      if(criteria.searchIntent==='friendship'||criteria.searchIntent==='hobby'){
        if(criteria.personality && u.personality===criteria.personality){score+=20;reasons.push(`${u.personality} mindset`);}
        if(criteria.city && u.city?.toLowerCase().includes(criteria.city.toLowerCase())){score+=15;reasons.push(u.city);}
      }

      // Recruitment: activity level matters
      if(criteria.searchIntent==='recruitment'){
        score += (u.questions||0) * 0.5; // active users
        if(u.personality==='intellectual'){score+=15;reasons.push('Engaged & active');}
      }

      // Gender filter
      if(criteria.gender && criteria.gender!=='any'){
        if(u.gender===criteria.gender) score+=15;
        else score-=20;
      }

      // City
      if(criteria.city && u.city){
        if(u.city.toLowerCase().includes(criteria.city.toLowerCase())){score+=20;reasons.push(u.city);}
      }

      // Personality
      if(criteria.personality && u.personality===criteria.personality){score+=15;}

      // Age range
      if(u.age && (criteria.ageRange?.min||criteria.ageRange?.max)){
        const {min,max} = criteria.ageRange;
        if((!min||u.age>=min)&&(!max||u.age<=max)) score+=10;
        else score-=15;
      }

      // Randomness factor (keep it fresh, 1 in 5 is serendipitous)
      if(Math.random() < 0.2) score += 30; // surprise pick
      else score += Math.random() * 8;

      return {user:u, score, reasons, matchPct: Math.min(99, Math.max(30, Math.round(score*1.8)))};
    }).filter(m => m.score > 0).sort((a,b) => b.score-a.score).slice(0,10);

    if(!scored.length){
      if(typeof renderEmptyState==='function'){
        renderEmptyState(resultsEl, {
          icon:'🌳',
          title:'No matches yet',
          message:'The community is still growing. Try broader terms like “cricket” or “tech”.',
        });
      } else {
        resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);"><div style="font-size:32px;margin-bottom:10px;">🌳</div><div style="font-size:14px;">No matches found yet. The community is still growing!<br>Try broader terms like "cricket" or "tech".</div></div>`;
      }
      return;
    }

    // Step 4: Generate personalised conversation starters (no-op when AI off)
    const summaries = scored.slice(0,5).map(m=>`${m.user.name}: ${m.user.age||'?'}y, ${m.user.city||'India'}, ${(m.user.interests||[]).join('/')}, ${m.user.bio||''}`).join('\n');
    let starters = {};
    if(aiOn){
      try{
        const sd = await callAI({
          tier:'fast', max_tokens:350, feature:'peepal_ai_starters',
          system:'Return ONLY a JSON object mapping name → {reason: "why they match in 1 sentence", starter: "natural first message to send, max 15 words, warm and specific"}. No generic messages.',
          messages:[{role:'user', content:`Search: "${query}"
Intent: ${criteria.searchIntent}
Profiles:
${summaries}`}]
        });
        starters = JSON.parse((sd.content?.[0]?.text||sd.text||'{}').replace(/```json|```/g,'').trim());
      }catch(e){}
    }

    // Render
    resultsEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">Top ${scored.length} matches</div>
        <div style="font-size:11px;color:var(--muted);">${criteria.vibe?`"${criteria.vibe.slice(0,40)}"`:''}</div>
      </div>
    `;

    scored.forEach(({user, score, reasons, matchPct})=>{
      const info = starters[user.name] || {};
      const reason = info.reason || reasons.join(' · ') || criteria.vibe || 'Shares your interests';
      const starter = info.starter || criteria.conversationStarter || `Hey! Found you on Peepal 👋`;
      const ib = typeof pickIcebreakerSnippet==='function'
        ? pickIcebreakerSnippet(typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):user.icebreakers)
        : null;
      const theirIb = typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):(user.icebreakers||[]);

      const card = document.createElement('div');
      card.className = 'peepal-ai-result-card';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:50px;height:50px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden;">
            ${user.photoURL?`<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;">`:user.avatar||'👤'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(user.name,user):user.name}</div>
            <div style="font-size:11px;color:var(--muted);">${[user.city,user.age?user.age+'y':'',user.personality||''].filter(Boolean).join(' · ')}</div>
            ${user.bio?`<div style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">"${user.bio}"</div>`:''}
          </div>
          <div style="background:rgba(230,57,70,0.1);color:var(--red);border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700;flex-shrink:0;">${matchPct}%</div>
        </div>
        ${(user.interests||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">${(user.interests||[]).slice(0,4).map(i=>`<span style="background:rgba(230,57,70,0.07);color:var(--red);border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;">📌 ${i}</span>`).join('')}</div>`:''}
        <div class="ai-match-reason">"${(typeof interestOverlapReason==='function' && interestOverlapReason(user)) || reason}"</div>
        ${ib?`<div class="discovery-icebreaker"><div class="discovery-icebreaker-label">Conversation starter</div><div class="discovery-icebreaker-text">"${ib.answer}"</div></div>`:''}
        <div style="background:rgba(43,39,48,0.04);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--muted);margin-top:6px;margin-bottom:10px;">
          💬 Suggested opener: <span style="color:var(--ink);font-style:italic;">"${starter}"</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="peepal-ai-view-btn" style="flex:1;padding:9px;background:var(--cream);border:2px solid var(--line);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">View questions</button>
          <button class="peepal-ai-chat-btn" data-name="${user.name}" data-uid="${user.uid}" data-starter="${starter.replace(/"/g,'&quot;')}" style="flex:1;padding:9px;background:var(--red);color:#fff;border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;cursor:pointer;">💬 Say hi</button>
        </div>
      `;

      card.querySelector('.peepal-ai-chat-btn').addEventListener('click', e=>{
        const name = e.currentTarget.dataset.name;
        const suggestedStarter = e.currentTarget.dataset.starter;
        document.getElementById('peepalAiSearch')?.classList.add('hidden');
        if(typeof openDmWithSharedHello==='function'){
          openDmWithSharedHello({
            uid: user.uid,
            name,
            avatar: user.avatar||'👤',
            theirIcebreakers: theirIb,
            starterText: suggestedStarter,
          });
          return;
        }
        const newChat = {id:`chat_ai_${user.uid}`,type:'dm',name,avatar:user.avatar||'👤',preview:'Found through Peepal AI search',time:'now',unread:0,duelStreak:0,theirIcebreakers:theirIb,icebreakers:theirIb};
        if(!SAMPLE_CHATS.find(c=>c.id===newChat.id)) SAMPLE_CHATS.unshift(newChat);
        document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='baithak')b.click();});
        setTimeout(()=>{
          initBaithak();
          setTimeout(()=>{
            openChatScreen(newChat);
            setTimeout(()=>{
              const msgInput = document.getElementById('chatMsgInput');
              if(msgInput) msgInput.value = suggestedStarter;
            },400);
          },300);
        },200);
      });

      resultsEl.appendChild(card);
    });

    // Serendipity note at bottom
    if(scored.length>=3){
      const note = document.createElement('div');
      note.style.cssText='text-align:center;padding:14px;font-size:12px;color:var(--muted);';
      note.innerHTML='✨ 1 in 5 results is a surprise pick — sometimes the best connections are unexpected';
      resultsEl.appendChild(note);
    }

  }catch(err){
    console.error(err);
    if(typeof renderErrorState==='function'){
      renderErrorState(resultsEl, {
        title:'Search couldn’t finish',
        message: typeof friendlyError==='function'?friendlyError(err):'Couldn’t connect right now. Try again in a moment.',
        onRetry:()=>runPeepalAiSearch(),
      });
    } else {
      resultsEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);">Couldn't connect right now. Try again in a moment.</div>`;
    }
  }
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
  if(statusData.online) return '<span style="color:#2ECC71;font-size:11px;font-weight:700;">● Online</span>';
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
  if(db&&currentUser) db.collection('users').doc(currentUser.uid).update({openToMeet}).catch(()=>{});

  if(newValue){
    // Show what it means
    const sheet = document.createElement('div');
    sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:24px;z-index:100;';
    sheet.innerHTML=`
      <div style="font-size:28px;text-align:center;margin-bottom:12px;">👋</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;text-align:center;margin-bottom:8px;">You're open to meeting people!</div>
      <div style="font-size:13px;color:var(--muted);text-align:center;line-height:1.6;margin-bottom:16px;">Your profile may now appear in Peepal's "You might enjoy talking to" section and in people's AI search results. You can turn this off anytime in Settings.</div>
      <div style="background:var(--cream);border-radius:14px;padding:14px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:8px;">What this means:</div>
        ${['Your profile shows up in Peepal discoveries for people with similar interests','AI search results include you when someone describes your type','You\'ll see more relevant people in your own Peepal feed','You can turn off at any time — no one is notified'].map(t=>`<div style="font-size:12px;color:var(--muted);padding:4px 0;display:flex;gap:8px;"><span>✓</span><span>${t}</span></div>`).join('')}
      </div>
      <button id="closeOpenToMeetSheet" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">Got it! 🎉</button>
    `;
    document.querySelector('.device').appendChild(sheet);
    document.getElementById('closeOpenToMeetSheet').addEventListener('click',()=>sheet.remove());
  } else {
    showToast('Discovery turned off. You won\'t appear in others\' Peepal suggestions.');
  }
}

// ===================== ANONYMOUS QUESTIONS IN PEEPAL =====================
const ANON_Q_KEY = `chaupaal_anon_q_${new Date().toISOString().split('T')[0]}`;
function hasUsedAnonToday(){ return !!localStorage.getItem(ANON_Q_KEY); }
function markAnonUsed(){ localStorage.setItem(ANON_Q_KEY,'1'); }

function openPeepalAskSheet(){
  const hasAnon = !hasUsedAnonToday();
  const sheet = document.createElement('div');
  sheet.className = 'peepal-ask-sheet';
  sheet.innerHTML=`
    <div class="ask-header">
      <button id="closeAsk" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">Ask Peepal</div>
      <button class="btn btn--primary btn--sm peepal-ask-publish-btn" id="peepalPublishBtn">Post</button>
    </div>
    <div style="padding:16px;">
      <!-- Anonymous toggle -->
      <div style="background:${hasAnon?'rgba(230,57,70,0.05)':'var(--line)'};border:2px solid ${hasAnon?'var(--red)':'var(--line)'};border-radius:14px;padding:12px;margin-bottom:16px;display:flex;align-items:center;gap:12px;${!hasAnon?'opacity:0.5':''}">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">🎭 Post anonymously</div>
          <div style="font-size:11px;color:var(--muted);">${hasAnon?'1 anonymous question per day — you have 1 left':'You\'ve used your anonymous question today. Come back tomorrow!'}</div>
        </div>
        <label class="switch" style="${!hasAnon?'pointer-events:none;':''}"><input type="checkbox" id="anonToggle" ${!hasAnon?'disabled':''}><span class="slider"></span></label>
      </div>
      <!-- Format -->
      <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;">
        ${[{id:'mcq',label:'📋 MCQ'},{id:'binary',label:'⚖️ Binary'},{id:'open',label:'💬 Open'},{id:'poll',label:'📊 Poll'}].map((f,i)=>`<button class="peepal-format-chip${i===0?' active':''}" data-fmt="${f.id}" style="padding:8px 14px;border-radius:999px;border:2px solid ${i===0?'var(--red)':'var(--line)'};background:${i===0?'rgba(230,57,70,0.08)':'var(--white)'};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;color:${i===0?'var(--red)':'var(--ink)'};">${f.label}</button>`).join('')}
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
          <option value="everyone">🌍 Everyone</option>
          <option value="friends">👥 Friends only</option>
          <option value="ai">🤖 AI decides</option>
          <option value="save_only">💾 Save without posting</option>
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
          <option value="custom">Custom number…</option>
        </select>
        <input id="peepalCustomCap" type="number" min="1" max="5000" placeholder="Custom cap" style="display:none;width:100%;margin-top:8px;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-size:14px;box-sizing:border-box;background:var(--white);">
      </div>
      <!-- Cascading audience segments -->
      <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Audience segments (cascade)</div>
          <button type="button" id="peepalAddSegment" style="background:none;border:none;color:var(--red);font-weight:700;font-size:12px;cursor:pointer;">+ Add</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.35;">Segment 1 fills first. When it hits its cap or engagement stalls, the next segment starts automatically — no prompt. Add as many as you need (soft limit 15).</div>
        <div id="peepalSegmentsList"></div>
      </div>
      <!-- Nudge templates -->
      <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;">✨ Quick templates</div>
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

  // Segment builder state
  let segmentDrafts=[{label:'Segment 1',city:'',gender:'any',intent:'any',capMode:'inherit'}];
  const segList=document.getElementById('peepalSegmentsList');
  function renderSegments(){
    if(!segList) return;
    segList.innerHTML=segmentDrafts.map((s,i)=>`
      <div class="peepal-seg-row" data-seg="${i}" style="background:var(--cream);border-radius:12px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:12px;">${i+1}. ${s.label||'Segment'}</strong>
          ${segmentDrafts.length>1?`<button type="button" data-seg-remove="${i}" style="border:none;background:none;color:var(--muted);cursor:pointer;">✕</button>`:''}
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
    if(segmentDrafts.length>=15){ showToast('Soft limit · 15 segments'); return; }
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
  });

  document.getElementById('peepalPublishBtn').addEventListener('click',async()=>{
    const text=qText.value.trim();
    if(!text){showToast('Please write your question first');return;}
    const unlock=typeof beginClientMutation==='function'?beginClientMutation('peepal_post'):()=>{};
    if(unlock===false){ showToast('Post already submitting…'); return; }
    const pubBtn=document.getElementById('peepalPublishBtn');
    const pubLabel=pubBtn?pubBtn.textContent:'';
    if(pubBtn){ pubBtn.disabled=true; pubBtn.textContent='Posting…'; }
    try{
    if(typeof checkRateLimit==='function'){
      const rl=await checkRateLimit('post');
      if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||'Slow down'); return; }
    }
    const quota=await checkPeepalQuota();
    if(!quota.ok){showToast('Weekly limit reached (5/week). Upgrade to Premium for more!');return;}
    const isAnon=document.getElementById('anonToggle').checked&&hasAnon&&!hasUsedAnonToday();
    if(isAnon) markAnonUsed();
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
    const q={id:`q_${Date.now()}`,question:text,format:fmt,options:opts,responses:opts.map(()=>0),totalResponses:0,comments:0,timeAgo:'just now',ts:Date.now(),tag:fmt.toUpperCase(),answered:false,deleted:false,
      audience:saveOnly?'private':audience, responseLimitMode, responseCap:postCap, audienceSegments:saveOnly?[]:audienceSegments,
      segmentDistributionActive:!saveOnly && audienceSegments.some(s=>s.status==='active'),
      activeSegmentIndex:0,
      archived:!!saveOnly,
      saveOnly:!!saveOnly,
      user:isAnon?{name:'Anonymous',avatar:'🎭',uid:'anon',profileType:'personal'}:{name:userProfile?.name||'You',avatar:userProfile?.photoURL||'🪑',uid:currentUser?.uid||'me',profileType:(typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal'))},
      anonymous:isAnon,uid:currentUser?.uid||'me'};

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
        showToast(typeof friendlyError==='function'?friendlyError(e):'Image upload failed — posting without photo');
      }
      pendingPeepalAttachment=null;
    } else if(typeof pendingPeepalAttachment!=='undefined'&&pendingPeepalAttachment?.type==='link'){
      q.attachment=pendingPeepalAttachment;
      pendingPeepalAttachment=null;
    }

    if(!saveOnly) peepalQuestions.unshift(q);
    peepalDraft?.clear?.();
    if(db&&currentUser&&!isAnon){
      try{
        if(typeof assertOwnUid==='function'&&!assertOwnUid(currentUser.uid)) throw new Error('Not authorized');
        const ref=await db.collection('peepal').add({
          question:q.question,format:q.format,options:q.options,responses:q.responses,
          totalResponses:0,comments:0,tag:q.tag,user:q.user,anonymous:false,
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
      }catch(e){
        showToast(typeof friendlyError==='function'?friendlyError(e):'Saved locally; sync failed');
      }
    }
    saveToArchive({type:'peepal_post',...q});
    sheet.classList.remove('open');setTimeout(()=>sheet.remove(),350);
    renderPeepalFeed();
      if(typeof trackPostCreated==='function') trackPostCreated(isAnon?'peepal_anon':'peepal');
      if(typeof SoundLib!=='undefined'&&SoundLib.postPublish) SoundLib.postPublish();
      showToast(saveOnly?'Saved privately to Archive':(isAnon?'Posted anonymously 🎭':'Question posted to Peepal! 🌳'));
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

