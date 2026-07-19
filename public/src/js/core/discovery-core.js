// ===================== SAMPLE DISCOVERY POOL =====================
const SAMPLE_DISCOVERY_POOL = [
  {uid:'u_riya',name:'Riya Sharma',avatar:'😊',photoURL:null,city:'Mumbai',age:24,gender:'female',personality:'social',openToMeet:true,interests:['Sports','Tech','Music'],bio:'Cricket on weekends, startups on weekdays',questions:12,icebreakers:[{promptId:'ib14',answer:'Cutting chai, extra adrak — non-negotiable after the local.'}]},
  {uid:'u_arjun',name:'Arjun Mehta',avatar:'🏔️',photoURL:null,city:'Delhi',age:27,gender:'male',personality:'outdoorsy',openToMeet:true,interests:['Sports','Travel','World'],bio:'Always planning the next trek',questions:8,icebreakers:[{promptId:'ib18',answer:'Road trip — windows down, random dhabas, no timetable.'}]},
  {uid:'u_priya',name:'Priya Nair',avatar:'👩',photoURL:null,city:'Bengaluru',age:25,gender:'female',personality:'intellectual',openToMeet:true,interests:['Tech','Business','GK'],bio:'Product manager who loves quizzes',questions:20,icebreakers:[{promptId:'ib05',answer:'Filter coffee forever. Tea is lovely; coffee is a personality.'},{promptId:'ib15',answer:'Church Street walk, then that tiny dosa place before traffic wakes up.'}]},
  {uid:'u_dev',name:'Dev Sharma',avatar:'👨',photoURL:null,city:'Pune',age:29,gender:'male',personality:'intellectual',openToMeet:true,interests:['Business','World','GK'],bio:'Reading non-fiction and debating',questions:15,icebreakers:[{promptId:'ib10',answer:'A stranger returned my dropped metro card. Tiny, but it stuck.'}]},
  {uid:'u_ananya',name:'Ananya Iyer',avatar:'🎨',photoURL:null,city:'Chennai',age:23,gender:'female',personality:'cinephile',openToMeet:true,interests:['Movies','Music','Food'],bio:'Film festivals + filter coffee',questions:6,icebreakers:[{promptId:'ib16',answer:'Pongal — the kolam, the sugarcane, the slow morning with family.'}]},
  {uid:'u_kabir',name:'Kabir Singh',avatar:'🎮',photoURL:null,city:'Hyderabad',age:26,gender:'male',personality:'social',openToMeet:true,interests:['Tech','Sports','Music'],bio:'Gamer, coder, chai addict',questions:10,icebreakers:[{promptId:'ib14',answer:'Irani chai + Osmania biscuit. Hilltop debates optional.'}]},
  {uid:'u_meera',name:'Meera Kapoor',avatar:'📚',photoURL:null,city:'Jaipur',age:28,gender:'female',personality:'intellectual',openToMeet:true,interests:['GK','World','Travel'],bio:'History nerd who loves museums',questions:18,icebreakers:[{promptId:'ib17',answer:'"Khamma ghani" — say it once and the city softens.'}]},
  {uid:'u_rohan',name:'Rohan Kapoor',avatar:'👨‍💻',photoURL:null,city:'Mumbai',age:30,gender:'male',personality:'intellectual',openToMeet:true,interests:['Tech','Business','Sports'],bio:'Building something new',questions:9,icebreakers:[{promptId:'ib19',answer:'Pottery on weekends. Hands full of clay, brain finally quiet.'}]},
  {uid:'u_sneha',name:'Sneha Joshi',avatar:'🌱',photoURL:null,city:'Mumbai',age:22,gender:'female',personality:'outdoorsy',openToMeet:true,interests:['Travel','Food','World'],bio:'Looking for travel buddies',questions:5,icebreakers:[{promptId:'ib15',answer:'Sunset at Bandra bandstand, then whatever stall smells best.'}]},
  {uid:'u_vikram',name:'Vikram Rao',avatar:'🏏',photoURL:null,city:'Ahmedabad',age:31,gender:'male',personality:'social',openToMeet:true,interests:['Sports','Business','India'],bio:'IPL nights and chai debates',questions:14,icebreakers:[{promptId:'ib14',answer:'Cutting chai with extra sugar — fight me.'}]},
];

let dismissedUids = new Set(JSON.parse(localStorage.getItem('chaupaal_dismissed_uids')||'[]'));
let discoveryCurrentSet = [];
let discoveryPreviousSet = [];
const DISCOVERY_FILTER_KEY = 'chaupaal_discovery_filters';
let discoveryFilters = (() => {
  try {
    return { interest: 'any', sameCity: false, recentlyJoined: false, ...JSON.parse(localStorage.getItem(DISCOVERY_FILTER_KEY) || '{}') };
  } catch (e) {
    return { interest: 'any', sameCity: false, recentlyJoined: false };
  }
})();

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

async function getDiscoveryProfiles(){
  const pool = [...SAMPLE_DISCOVERY_POOL];
  if(db && currentUser){
    try{
      const snap = await db.collection('users').where('openToMeet','==',true).limit(40).get();
      snap.docs.forEach(d=>{
        const u=d.data();
        const uid=u.uid||d.id;
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
      const recentSnap=await db.collection('users').orderBy('createdAt','desc').limit(12).get();
      recentSnap.docs.forEach(d=>{
        const u=d.data()||{};
        const uid=u.uid||d.id;
        if(uid===currentUser.uid||u.openToMeet===false||!u.name||pool.find(p=>p.uid===uid)) return;
        pool.push({...u,uid});
      });
    }catch(e){}
  }

  const myInterests = new Set([
    ...(personalityProfile?.interests||[]),
    ...(myCategories||[]).map(c=>c.name),
  ].map(i=>String(i).toLowerCase()));

  const myCity=String(userProfile?.city||digitalProfile?.currentCity||'').trim().toLowerCase();
  return pool
    .filter(u => {
      if(!u||!u.uid||dismissedUids.has(u.uid)||u.openToMeet===false) return false;
      if(discoveryFilters.sameCity&&myCity&&String(u.city||'').trim().toLowerCase()!==myCity) return false;
      if(discoveryFilters.recentlyJoined&&!isRecentlyJoined(u)) return false;
      if(discoveryFilters.interest&&discoveryFilters.interest!=='any'){
        const wanted=discoveryFilters.interest.toLowerCase();
        const theirs=[...(u.interests||[]),u.topCat].filter(Boolean).map(i=>String(i).toLowerCase());
        if(!theirs.some(i=>i===wanted||i.includes(wanted)||wanted.includes(i))) return false;
      }
      return true;
    })
    .map(u=>{
      const their = [...(u.interests||[]), u.topCat].filter(Boolean).map(i=>String(i).toLowerCase());
      const shared = their.filter(i => [...myInterests].some(m => m.includes(i) || i.includes(m)));
      let score = 40 + Math.random()*25;
      if(shared.length) score += shared.length * 12;
      if(u.city && (userProfile?.city||digitalProfile?.currentCity||'').toLowerCase().includes(String(u.city).toLowerCase())) score += 15;
      const matchPct = Math.min(98, Math.max(42, Math.round(score)));
      const reasons = shared.length
        ? shared.slice(0,3).map(s=>s.charAt(0).toUpperCase()+s.slice(1))
        : (u.interests||[]).slice(0,2);
      return {
        user:{...u,_isNew:isRecentlyJoined(u)},
        score,
        matchPct,
        reasons,
        reason: shared.length
          ? `You both care about ${shared.slice(0,2).join(' & ')}`
          : (u.bio || 'Someone you might enjoy talking to on Peepal'),
      };
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
}

function renderDiscoverySection(profiles){
  const el = document.createElement('div');
  el.className = 'peepal-discovery';
  el.id = 'peepalDiscovery';
  if(!profiles || !profiles.length){
    if(typeof renderEmptyState==='function'){
      renderEmptyState(el, {
        icon:'🌳',
        title:'No suggestions right now',
        message:'Check back later — discovery gets better as more people join Peepal.',
      });
    } else {
      el.innerHTML = `<div class="discovery-loading">No discovery suggestions right now — check back later 🌳</div>`;
    }
    return el;
  }
  el.innerHTML = `
    <div class="discovery-ai-label">✨ AI suggestions</div>
    <div class="peepal-discovery-header">
      <div>
        <div class="peepal-discovery-title">You might enjoy talking to</div>
        <div class="peepal-discovery-subtitle">Based on your interests & Peepal activity</div>
      </div>
      <button class="peepal-undo-btn" id="discoveryUndoBtn" ${discoveryPreviousSet.length?'':'disabled'}>↩ Undo</button>
    </div>
    <div class="discovery-filters" aria-label="Discovery filters">
      <select data-discovery-filter="interest" aria-label="Filter by interest">
        <option value="any">All interests</option>
        ${['Sports','Tech','Business','Music','Food','Travel','Movies','GK','India','World'].map(i=>`<option value="${i}" ${discoveryFilters.interest===i?'selected':''}>${i}</option>`).join('')}
      </select>
      <label><input type="checkbox" data-discovery-filter="sameCity" ${discoveryFilters.sameCity?'checked':''}> Same city</label>
      <label><input type="checkbox" data-discovery-filter="recentlyJoined" ${discoveryFilters.recentlyJoined?'checked':''}> New here</label>
    </div>
    <div class="discovery-cards">
      ${profiles.map(({user, matchPct, reasons, reason})=>{
        const ib = typeof pickIcebreakerSnippet==='function'
          ? pickIcebreakerSnippet(typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):user.icebreakers)
          : null;
        const ibJson = encodeURIComponent(JSON.stringify(
          typeof resolveIcebreakersFromUser==='function'?resolveIcebreakersFromUser(user):(user.icebreakers||[])
        ));
        return `
        <div class="discovery-card" data-uid="${user.uid}">
          <div class="discovery-card-top">
            <div class="discovery-avatar-wrap">
              <div class="discovery-avatar">${user.photoURL?`<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:user.avatar||'👤'}</div>
              <div class="discovery-match-badge">${matchPct||'?'}%</div>
            </div>
            <div class="discovery-info">
              <div class="discovery-name">${user.name}</div>
              <div class="discovery-meta">${[user.city,user.age?user.age+'y':'',user.personality||''].filter(Boolean).join(' · ')}${user._isNew?' · <span class="discovery-new-badge">New here</span>':''}</div>
            </div>
            <button class="discovery-dismiss" data-uid="${user.uid}" title="Not interested">✕</button>
          </div>
          ${(reasons||[]).length?`<div class="discovery-shared">${reasons.slice(0,4).map(r=>`<span class="discovery-shared-tag">📌 ${r}</span>`).join('')}</div>`:''}
          <div class="discovery-reason">"${(typeof interestOverlapReason==='function' && interestOverlapReason(user)) || reason||'Shared interests on Chaupaal'}"</div>
          ${ib?`<div class="discovery-icebreaker"><div class="discovery-icebreaker-label">Conversation starter</div><div class="discovery-icebreaker-text">"${ib.answer}"</div></div>`:''}
          <div class="discovery-actions">
            <button class="discovery-view-btn" data-uid="${user.uid}">View profile</button>
            <button class="discovery-friend-btn" data-friend-uid="${user.uid}">Add Friend</button>
          </div>
          <button class="discovery-nudge-btn discovery-nudge-btn--secondary" data-uid="${user.uid}" data-name="${user.name}" data-avatar="${user.avatar||'👤'}" data-icebreakers="${ibJson}">💬 Say hi</button>
        </div>`;
      }).join('')}
    </div>
  `;

  el.querySelectorAll('.discovery-dismiss').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const uid=btn.dataset.uid;
      dismissedUids.add(uid);
      try{localStorage.setItem('chaupaal_dismissed_uids',JSON.stringify([...dismissedUids]));}catch(err){}
      btn.closest('.discovery-card')?.remove();
      showToast('Got it — fewer like this');
    });
  });

  el.querySelectorAll('[data-discovery-filter]').forEach(control=>{
    control.addEventListener('change',async()=>{
      const key=control.dataset.discoveryFilter;
      discoveryFilters[key]=control.type==='checkbox'?control.checked:control.value;
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
    if(typeof wireFriendAction==='function') wireFriendAction(btn,btn.dataset.friendUid);
  });

  el.querySelectorAll('.discovery-avatar').forEach(avatar=>{
    const card=avatar.closest('.discovery-card');
    const match=profiles.find(p=>p.user?.uid===card?.dataset.uid);
    if(match?.user&&typeof bindProfileLongPress==='function') bindProfileLongPress(avatar,match.user);
  });

  el.querySelectorAll('.discovery-nudge-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name=btn.dataset.name;
      const avatar=btn.dataset.avatar;
      const uid=btn.dataset.uid;
      let theirIcebreakers=[];
      try{ theirIcebreakers=JSON.parse(decodeURIComponent(btn.dataset.icebreakers||'%5B%5D')); }catch(e){}
      if(typeof openDmWithSharedHello==='function'){
        openDmWithSharedHello({ uid, name, avatar, theirIcebreakers });
        return;
      }
      const newChat={id:`chat_disc_${uid}`,type:'dm',name,avatar,preview:'Found through Peepal discovery',time:'now',unread:0,duelStreak:0,theirIcebreakers,icebreakers:theirIcebreakers};
      if(typeof SAMPLE_CHATS!=='undefined' && !SAMPLE_CHATS.find(c=>c.id===newChat.id)) SAMPLE_CHATS.unshift(newChat);
      document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='baithak')b.click();});
      setTimeout(()=>{
        if(typeof initBaithak==='function') initBaithak();
        setTimeout(()=>openChatScreen(newChat),300);
      },200);
    });
  });

  el.querySelector('#discoveryUndoBtn')?.addEventListener('click',()=>{
    if(!discoveryPreviousSet.length)return;
    const feed=document.getElementById('peepalFeed');
    document.getElementById('peepalDiscovery')?.remove();
    discoveryCurrentSet=[...discoveryPreviousSet];
    if(feed?.parentElement) feed.parentElement.insertBefore(renderDiscoverySection(discoveryCurrentSet),feed);
  });

  return el;
}
