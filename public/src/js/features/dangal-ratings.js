// ===================== CATEGORY RATINGS + DANGAL GRID =====================
const NEWS_CATEGORIES = ['GK','Sports','Tech','Business','India','World'];
const CATEGORY_ICONS = {GK:'🧠',Sports:'🏏',Tech:'💻',Business:'📈',India:'🇮🇳',World:'🌍'};

const LEADERBOARD_PAGE=10;
let lbCursor=null;
let lbHasMore=false;
let lbEntries=[];
let lbLoading=false;
const LB_SAMPLE=[{name:'Riya S.',score:'15/15'},{name:'Dev K.',score:'14/15'},{name:'Priya N.',score:'13/15'},{name:'Arjun M.',score:'12/15'}];

async function loadLeaderboard(){
  lbCursor=null; lbHasMore=true; lbEntries=[];
  await loadLeaderboardPage({reset:true});
}

async function loadLeaderboardPage({reset=false}={}){
  const el=document.getElementById('rpLeaderboard');if(!el)return;
  if(lbLoading) return;
  if(!reset&&!lbHasMore) return;
  lbLoading=true;
  if(reset&&typeof renderSkeleton==='function') renderSkeleton(el, {variant:'list', count:4});
  const today=new Date().toISOString().split('T')[0];
  try{
    if(!db){renderLeaderboardUI(LB_SAMPLE,el,{hasMore:false});lbLoading=false;return;}
    let q=db.collection('daily_scores').doc(today).collection('scores').orderBy('score','desc');
    if(lbCursor) q=q.startAfter(lbCursor);
    q=q.limit(LEADERBOARD_PAGE);
    const snap=await q.get();
    if(reset&&snap.empty){renderLeaderboardUI(LB_SAMPLE,el,{hasMore:false});lbLoading=false;return;}
    const page=snap.docs.map(d=>({
      name:d.data().name?.split(' ')[0]||'Player',
      score:`${d.data().score}/${d.data().total||15}`,
      __doc:d,
    }));
    if(reset) lbEntries=page; else lbEntries=lbEntries.concat(page);
    lbCursor=snap.docs.length?snap.docs[snap.docs.length-1]:null;
    lbHasMore=snap.docs.length>=LEADERBOARD_PAGE;
    renderLeaderboardUI(lbEntries,el,{hasMore:lbHasMore});
  }catch(e){
    if(reset) renderLeaderboardUI(LB_SAMPLE,el,{hasMore:false});
  }finally{
    lbLoading=false;
  }
}

function renderLeaderboardUI(entries,el,{hasMore=false}={}){
  const medals=['🥇','🥈','🥉'];
  el.innerHTML=entries.map((e,i)=>`
    <div class="rp-leaderboard-item">
      <div class="rp-rank ${i===0?'gold':''}">${medals[i]||i+1}</div>
      <div class="rp-name">${e.name}</div>
      <div class="rp-score">${e.score}</div>
    </div>
  `).join('');
  const myScore=document.getElementById('rpYourScore')?.textContent;
  if(myScore&&myScore!=='—'){
    el.innerHTML+=`<div class="rp-leaderboard-item" style="border-top:1px solid var(--line);margin-top:4px;padding-top:8px;"><div class="rp-rank">You</div><div class="rp-name">${userProfile?.name?.split(' ')[0]||'You'}</div><div class="rp-score" id="rpYourScore">${myScore}</div></div>`;
  }
  if(hasMore&&typeof ensureLoadMoreButton==='function'){
    ensureLoadMoreButton(el,{
      label:'Show more',
      onLoadMore:()=>loadLeaderboardPage({reset:false}),
    });
  }
}

function dangalTileHtml(g){
  const rating=typeof getGameRating==='function'?getGameRating(g.ratingKey):null;
  const soloTag=g.solo||g.gameType==='solo'?'<span class="dangal-solo-tag">SOLO</span>':'';
  const accent=(typeof GAME_ACCENTS!=='undefined'&&GAME_ACCENTS[g.id])||'var(--red)';
  return`<div class="dangal-game-tile ${g.featured?'featured':''}" data-game="${g.id}" style="--tile-accent:${accent}">
    <div class="dangal-game-icon">${g.icon}</div>
    <div>
      <div class="dangal-game-name">${g.name}${soloTag}</div>
      <div class="dangal-game-desc">${g.desc}</div>
      ${rating?`<div class="dangal-game-rating-pill">★ ${rating}</div>`:''}
    </div>
  </div>`;
}

function wireDangalTiles(root){
  (root||document).querySelectorAll('[data-game]').forEach(tile=>{
    tile.addEventListener('click',()=>{
      if(typeof markGamePlayed==='function') markGamePlayed(tile.dataset.game);
      if(typeof handleDangalGameTap==='function')handleDangalGameTap(tile.dataset.game);
    });
  });
}

function renderDangalContinueAndChips(host){
  if(!host) return;
  // Challenge-from-chat / viral challenge chip
  let challengeChip='';
  const pending=typeof consumeBeatScoreChallenge==='function'?consumeBeatScoreChallenge():null;
  if(pending&&pending.challenger){
    const gName=(typeof getGame==='function'&&getGame(pending.game)?.name)||pending.game;
    challengeChip=`<button type="button" class="dangal-challenge-chip" id="dangalChallengeChip">
      <div><strong>${pending.challenger} challenged you</strong><span>Beat ${pending.score!=null?pending.score:'their score'} on ${gName}</span></div>
      <span>Play →</span>
    </button>`;
  }

  // Continue / last played
  let continueChip='';
  const last=typeof getLastPlayedGame==='function'?getLastPlayedGame():null;
  if(last&&last.id&&typeof getGame==='function'){
    const g=getGame(last.id==='muqabala'?'quiz':last.id);
    if(g){
      continueChip=`<button type="button" class="dangal-continue-chip" id="dangalContinueChip" data-game="${g.id}">
        <div><strong>Continue · ${g.icon} ${g.name}</strong><span>Pick up where you left off</span></div>
        <span>→</span>
      </button>`;
    }
  }

  // Daily spotlight
  let spotlightChip='';
  const spotId=typeof getDailySpotlightGameId==='function'?getDailySpotlightGameId():'quiz';
  const spot=typeof getGame==='function'?getGame(spotId):null;
  if(spot){
    spotlightChip=`<button type="button" class="dangal-spotlight-chip" id="dangalSpotlightChip" data-game="${spot.id}">
      <div><strong>Today's spotlight · ${spot.icon} ${spot.name}</strong><span>${spot.desc}</span></div>
      <span>Play →</span>
    </button>`;
  }

  const wrap=document.createElement('div');
  wrap.className='dangal-chips';
  wrap.innerHTML=challengeChip+continueChip+spotlightChip;
  host.appendChild(wrap);

  wrap.querySelector('#dangalChallengeChip')?.addEventListener('click',()=>{
    if(!pending)return;
    if(pending.game==='quiz'||pending.game==='muqabala'){
      if(typeof startMuqabala==='function') startMuqabala(pending.challenger, pending.cat||'GK');
    } else if(typeof getGame==='function'){
      const g=getGame(pending.game);
      if(g) g.launch({source:'challenge', beatScore:pending.score, challenger:pending.challenger});
    }
  });
  wrap.querySelector('#dangalContinueChip')?.addEventListener('click',(e)=>{
    const id=e.currentTarget.dataset.game;
    if(typeof handleDangalGameTap==='function') handleDangalGameTap(id);
  });
  wrap.querySelector('#dangalSpotlightChip')?.addEventListener('click',(e)=>{
    const id=e.currentTarget.dataset.game;
    if(typeof markGamePlayed==='function') markGamePlayed(id);
    if(typeof handleDangalGameTap==='function') handleDangalGameTap(id);
  });
}

function renderDangalGamesGrid(){
  const grid=document.getElementById('dangalGamesGrid');if(!grid)return;
  const overall=document.getElementById('dangalOverallRating');
  if(overall){
    const quizRatings=userProfile?.categoryRatings||{};
    const avgQuiz=Math.round(NEWS_CATEGORIES.reduce((s,c)=>s+(quizRatings[c]||1200),0)/NEWS_CATEGORIES.length);
    overall.innerHTML=`<span class="dor-label">Quiz Rating</span><span class="dor-val">${avgQuiz}</span>`;
  }

  const library=typeof getGames==='function'?getGames({dangal:true}):[];
  const featured=library.filter(g=>g.featured);
  const solos=library.filter(g=>(g.solo||g.gameType==='solo')&&!g.featured);
  const vsFriend=library.filter(g=>!g.featured&&!(g.solo||g.gameType==='solo'));

  grid.innerHTML='';
  renderDangalContinueAndChips(grid);

  const sections=[
    {label:'Featured', items:featured, featured:true},
    {label:'Quick solos', items:solos},
    {label:'Vs friend', items:vsFriend},
  ];
  sections.forEach(sec=>{
    if(!sec.items.length) return;
    const section=document.createElement('div');
    section.className='dangal-section';
    section.innerHTML=`<div class="dangal-section-label">${sec.label}</div>
      <div class="dangal-section-grid${sec.featured?' dangal-section-grid--featured':''}">
        ${sec.items.map(dangalTileHtml).join('')}
      </div>`;
    grid.appendChild(section);
  });
  wireDangalTiles(grid);

  // Weekly friends board (best-effort from readable gameRatings)
  const boardHost=document.createElement('div');
  boardHost.id='dangalFriendsBoardHost';
  grid.appendChild(boardHost);
  if(typeof buildWeeklyFriendsBoard==='function'){
    buildWeeklyFriendsBoard('chess').then(rows=>{
      if(!rows||rows.length<2||!boardHost.isConnected) return;
      if(typeof weeklyFriendsBoardHtml==='function'){
        boardHost.innerHTML=weeklyFriendsBoardHtml(rows);
      }
    }).catch(()=>{});
  }
}

function getGameRating(key){
  if(!key)return null;
  const ratings=userProfile?.gameRatings||JSON.parse(localStorage.getItem('chaupaal_game_ratings')||'{}');
  return ratings[key]||1200;
}

function recordGameResult(key,won,drew){
  if(!key)return;
  const ratings=JSON.parse(localStorage.getItem('chaupaal_game_ratings')||'{}');
  const cur=ratings[key]||1200;
  const delta=won?16:drew?2:-12;
  ratings[key]=Math.max(800,cur+delta);
  ratings[key+'_lastPlayed']=Date.now();
  localStorage.setItem('chaupaal_game_ratings',JSON.stringify(ratings));
  if(db&&currentUser)db.collection('users').doc(currentUser.uid).update({[`gameRatings.${key}`]:ratings[key]}).catch(()=>{});
  if(typeof markGamePlayed==='function') markGamePlayed(key==='wordguess'?'wordguess':key);
}

function openQuizCategorySheet(){
  const sheet=document.getElementById('quizCategorySheet');
  const ratings=userProfile?.categoryRatings||{};
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">Choose a Quiz Category</div>
      <button id="closeQuizCatSheet" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Pick a topic for your Muqabala</div>
    <div class="quiz-cat-grid">
      ${NEWS_CATEGORIES.map(cat=>`
        <div class="quiz-cat-card" data-cat="${cat}">
          <div class="quiz-cat-icon">${CATEGORY_ICONS[cat]}</div>
          <div class="quiz-cat-name">${cat}</div>
          <div class="quiz-cat-rating">★ ${ratings[cat]||1200}</div>
        </div>
      `).join('')}
    </div>
    <div class="dangal-limit-bar" id="dangalLimitBar" style="margin:4px 0 14px;">
      <div class="dangal-limit-info"><span>Random Muqabala today</span><span class="dangal-limit-count" id="dangalLimitCount">3 / 3 remaining</span></div>
      <div class="dangal-limit-track"><div class="dangal-limit-fill" id="dangalLimitFill" style="width:100%"></div></div>
    </div>
    <button class="btn btn--primary btn--block btn--lg dangal-action-btn" id="aiFindMuqabalaBtn" style="background:linear-gradient(135deg,var(--navy),#2A3158);width:100%;">Find with AI (any category)</button>
  `;
  sheet.classList.remove('hidden');requestAnimationFrame(()=>sheet.classList.add('open'));
  document.getElementById('closeQuizCatSheet').addEventListener('click',()=>{sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);});
  sheet.querySelectorAll('[data-cat]').forEach(card=>{
    card.addEventListener('click',()=>{
      const cat=card.dataset.cat;
      sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);
      if(dailyMuqabalaCount>=DAILY_MUQABALA_LIMIT){showToast('Daily limit reached! Try AI finder or a friend challenge instead');return;}
      startMuqabala(null,cat);
    });
  });
  document.getElementById('aiFindMuqabalaBtn').addEventListener('click',()=>{
    sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);
    if(dailyMuqabalaCount>=DAILY_MUQABALA_LIMIT){showToast('Daily limit reached! Friend challenges are still unlimited');return;}
    openAIFinder();
  });
  updateLimitUI();
}

function initCategoryRatings(){
  renderDangalGamesGrid();
  const rpRatings=document.getElementById('rpRatings');
  const ratings=userProfile?.categoryRatings||{};
  if(rpRatings){
    rpRatings.innerHTML=NEWS_CATEGORIES.map(cat=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);">
        <span style="font-size:13px;">${CATEGORY_ICONS[cat]} ${cat}</span>
        <span style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;color:var(--red);">${ratings[cat]||1200}</span>
      </div>
    `).join('');
  }
  loadLeaderboard();
}

document.getElementById('sidebarProfile')?.addEventListener('click',()=>{
  renderProfileModal();
  document.getElementById('profileModal').classList.remove('hidden');
});
