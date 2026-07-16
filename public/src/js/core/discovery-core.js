// ===================== SAMPLE DISCOVERY POOL =====================
const SAMPLE_DISCOVERY_POOL = [
  {uid:'u_riya',name:'Riya Sharma',avatar:'😊',photoURL:null,city:'Mumbai',age:24,gender:'female',personality:'social',openToMeet:true,interests:['Sports','Tech','Music'],bio:'Cricket on weekends, startups on weekdays',questions:12},
  {uid:'u_arjun',name:'Arjun Mehta',avatar:'🏔️',photoURL:null,city:'Delhi',age:27,gender:'male',personality:'outdoorsy',openToMeet:true,interests:['Sports','Travel','World'],bio:'Always planning the next trek',questions:8},
  {uid:'u_priya',name:'Priya Nair',avatar:'👩',photoURL:null,city:'Bengaluru',age:25,gender:'female',personality:'intellectual',openToMeet:true,interests:['Tech','Business','GK'],bio:'Product manager who loves quizzes',questions:20},
  {uid:'u_dev',name:'Dev Sharma',avatar:'👨',photoURL:null,city:'Pune',age:29,gender:'male',personality:'intellectual',openToMeet:true,interests:['Business','World','GK'],bio:'Reading non-fiction and debating',questions:15},
  {uid:'u_ananya',name:'Ananya Iyer',avatar:'🎨',photoURL:null,city:'Chennai',age:23,gender:'female',personality:'cinephile',openToMeet:true,interests:['Movies','Music','Food'],bio:'Film festivals + filter coffee',questions:6},
  {uid:'u_kabir',name:'Kabir Singh',avatar:'🎮',photoURL:null,city:'Hyderabad',age:26,gender:'male',personality:'social',openToMeet:true,interests:['Tech','Sports','Music'],bio:'Gamer, coder, chai addict',questions:10},
  {uid:'u_meera',name:'Meera Kapoor',avatar:'📚',photoURL:null,city:'Jaipur',age:28,gender:'female',personality:'intellectual',openToMeet:true,interests:['GK','World','Travel'],bio:'History nerd who loves museums',questions:18},
  {uid:'u_rohan',name:'Rohan Kapoor',avatar:'👨‍💻',photoURL:null,city:'Mumbai',age:30,gender:'male',personality:'intellectual',openToMeet:true,interests:['Tech','Business','Sports'],bio:'Building something new',questions:9},
  {uid:'u_sneha',name:'Sneha Joshi',avatar:'🌱',photoURL:null,city:'Mumbai',age:22,gender:'female',personality:'outdoorsy',openToMeet:true,interests:['Travel','Food','World'],bio:'Looking for travel buddies',questions:5},
  {uid:'u_vikram',name:'Vikram Rao',avatar:'🏏',photoURL:null,city:'Ahmedabad',age:31,gender:'male',personality:'social',openToMeet:true,interests:['Sports','Business','India'],bio:'IPL nights and chai debates',questions:14},
];

let dismissedUids = new Set(JSON.parse(localStorage.getItem('chaupaal_dismissed_uids')||'[]'));
let discoveryCurrentSet = [];
let discoveryPreviousSet = [];

async function getDiscoveryProfiles(){
  const pool = [...SAMPLE_DISCOVERY_POOL];
  if(db && currentUser){
    try{
      const snap = await db.collection('users').where('openToMeet','==',true).limit(40).get();
      snap.docs.forEach(d=>{
        const u=d.data();
        if(u.uid && u.uid!==currentUser.uid && u.name && !pool.find(p=>p.uid===u.uid)) pool.push(u);
      });
    }catch(e){}
  }

  const myInterests = new Set([
    ...(personalityProfile?.interests||[]),
    ...(myCategories||[]).map(c=>c.name),
  ].map(i=>String(i).toLowerCase()));

  return pool
    .filter(u => u && u.uid && !dismissedUids.has(u.uid) && (u.openToMeet !== false))
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
        user:u,
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
    <div class="discovery-cards">
      ${profiles.map(({user, matchPct, reasons, reason})=>`
        <div class="discovery-card" data-uid="${user.uid}">
          <div class="discovery-card-top">
            <div class="discovery-avatar-wrap">
              <div class="discovery-avatar">${user.photoURL?`<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:user.avatar||'👤'}</div>
              <div class="discovery-match-badge">${matchPct||'?'}%</div>
            </div>
            <div class="discovery-info">
              <div class="discovery-name">${user.name}</div>
              <div class="discovery-meta">${[user.city,user.age?user.age+'y':'',user.personality||''].filter(Boolean).join(' · ')}</div>
            </div>
            <button class="discovery-dismiss" data-uid="${user.uid}" title="Not interested">✕</button>
          </div>
          ${(reasons||[]).length?`<div class="discovery-shared">${reasons.slice(0,4).map(r=>`<span class="discovery-shared-tag">📌 ${r}</span>`).join('')}</div>`:''}
          <div class="discovery-reason">"${reason||'Shared interests on Chaupaal'}"</div>
          <div class="discovery-actions">
            <button class="discovery-view-btn" data-uid="${user.uid}">View profile</button>
            <button class="discovery-nudge-btn" data-uid="${user.uid}" data-name="${user.name}" data-avatar="${user.avatar||'👤'}">💬 Say hi</button>
          </div>
        </div>
      `).join('')}
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

  el.querySelectorAll('.discovery-nudge-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name=btn.dataset.name;
      const avatar=btn.dataset.avatar;
      const uid=btn.dataset.uid;
      const newChat={id:`chat_disc_${uid}`,type:'dm',name,avatar,preview:'Found through Peepal discovery',time:'now',unread:0,duelStreak:0};
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
