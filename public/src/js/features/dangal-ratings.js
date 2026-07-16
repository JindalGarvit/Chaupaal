// ===================== CATEGORY RATINGS =====================
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
  // Add current user's score
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

const GAME_LIBRARY=[
  {id:'quiz',name:'Quiz Muqabala',desc:'GK, Sports, Tech & more — pick a category',icon:'🧠',featured:true,ratingKey:null},
  {id:'chess',name:'Chess',desc:'Classic strategy, AI opponent',icon:'♟',ratingKey:'chess'},
  {id:'snakes',name:'Snakes & Ladders',desc:'5 versions, picked at random',icon:'🐍',ratingKey:'snakes'},
  {id:'ludo',name:'Ludo',desc:'2, 3 or 4 players',icon:'🎯',ratingKey:'ludo'},
  {id:'uno',name:'Oh, No! Cards',desc:'Classic · Double Sided · Blaze Mode',icon:'🃏',ratingKey:'uno'},
  {id:'business',name:'Business',desc:'Buy, build & bankrupt — 2-6 players',icon:'🏙️',ratingKey:'business'},
  {id:'scribble',name:'Scribble',desc:'Draw & guess — any number of players',icon:'🎨',ratingKey:'scribble'},
  {id:'rushrunner',name:'Rush Runner',desc:'Endless runner · dodge & collect',icon:'🏃',ratingKey:'rushrunner',solo:true},
  {id:'candyburst',name:'Candy Burst',desc:'Match-3 · 100 levels',icon:'🍬',ratingKey:'candyburst',solo:true},
  {id:'ttt',name:'Tic-Tac-Toe',desc:'Quick & unbeatable AI',icon:'⭕',ratingKey:'ttt'},
  {id:'wordguess',name:'Word Guess',desc:'5-letter daily puzzle',icon:'📝',ratingKey:'wordguess'},
];

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
}

function renderDangalGamesGrid(){
  const grid=document.getElementById('dangalGamesGrid');if(!grid)return;
  const overall=document.getElementById('dangalOverallRating');
  if(overall){
    const quizRatings=userProfile?.categoryRatings||{};
    const avgQuiz=Math.round(NEWS_CATEGORIES.reduce((s,c)=>s+(quizRatings[c]||1200),0)/NEWS_CATEGORIES.length);
    overall.innerHTML=`<span class="dor-label">🧠 Quiz Rating</span><span class="dor-val">${avgQuiz}</span>`;
  }
  grid.innerHTML=GAME_LIBRARY.map(g=>{
    const rating=getGameRating(g.ratingKey);
    const soloTag=g.solo?'<span style="font-size:9px;font-weight:700;background:rgba(255,201,60,0.2);color:var(--gold);border-radius:4px;padding:2px 6px;margin-left:4px;vertical-align:middle;">SOLO</span>':'';
    return`<div class="dangal-game-tile ${g.featured?'featured':''}" data-game="${g.id}">
      <div class="dangal-game-icon">${g.icon}</div>
      <div>
        <div class="dangal-game-name">${g.name}${soloTag}</div>
        <div class="dangal-game-desc">${g.desc}</div>
        ${rating?`<div class="dangal-game-rating-pill">⭐ ${rating}</div>`:''}
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-game]').forEach(tile=>{
    tile.addEventListener('click',()=>handleDangalGameTap(tile.dataset.game));
  });
}

function handleDangalGameTap(gameId){
  if(gameId==='quiz'){openQuizCategorySheet();return;}
  if(gameId==='rushrunner'){openRushRunner();return;}
  if(gameId==='candyburst'){openCandyBurst();return;}
  if(gameId==='uno'){openUnoVariantPicker({name:'AI Opponent',id:'ai'});return;}
  if(gameId==='ludo'){
    const s=document.createElement('div');s.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
    s.innerHTML=`<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:14px;">🎯 Ludo — How many players?</div>
      ${[2,3,4].map(n=>`<button data-n="${n}" style="width:100%;padding:13px;background:var(--cream);border:2px solid var(--line);border-radius:14px;margin-bottom:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">${n} Players</button>`).join('')}
      <button id="closeLudoPick" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>`;
    document.querySelector('.device').appendChild(s);
    s.querySelectorAll('[data-n]').forEach(btn=>btn.addEventListener('click',()=>{s.remove();openLudoGame({name:'AI Opponent',id:'ai'},parseInt(btn.dataset.n));}));
    document.getElementById('closeLudoPick').addEventListener('click',()=>s.remove());
    return;
  }
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
  const game=GAME_LIBRARY.find(g=>g.id===gameId)||{icon:'🎮',name:gameId};
  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:14px;">${game.icon} ${game.name}</div>
    <button id="dgRandomOpp" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">🎯 Find a random opponent</button>
    <button id="dgFriendOpp" style="width:100%;padding:14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">👤 Challenge a friend</button>
    <button id="dgCancelGame" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('dgCancelGame').addEventListener('click',()=>sheet.remove());
  const launchGame=(chat)=>{sheet.remove();const fns={chess:openChessGame,snakes:openSnakesVersionPicker,ludo:c=>openLudoGame(c,2),uno:c=>openUnoVariantPicker(c),ttt:openTicTacToe,wordguess:openWordGuess,business:c=>openBusinessGame(c,2),scribble:c=>openScribbleGame(c,[{name:c.name}]),fiveinrow:openFiveInRowGame};fns[gameId]?.(chat);};
  document.getElementById('dgRandomOpp').addEventListener('click',()=>launchGame({name:'Priya_29',id:'random'}));
  document.getElementById('dgFriendOpp').addEventListener('click',()=>{const name=prompt('Enter your friend username:');if(name)launchGame({name,id:'friend_'+name});});
}

function openQuizCategorySheet(){
  const sheet=document.getElementById('quizCategorySheet');
  const ratings=userProfile?.categoryRatings||{};
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">🧠 Choose a Quiz Category</div>
      <button id="closeQuizCatSheet" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Pick a topic for your Muqabala</div>
    <div class="quiz-cat-grid">
      ${NEWS_CATEGORIES.map(cat=>`
        <div class="quiz-cat-card" data-cat="${cat}">
          <div class="quiz-cat-icon">${CATEGORY_ICONS[cat]}</div>
          <div class="quiz-cat-name">${cat}</div>
          <div class="quiz-cat-rating">⭐ ${ratings[cat]||1200}</div>
        </div>
      `).join('')}
    </div>
    <div class="dangal-limit-bar" id="dangalLimitBar" style="margin:4px 0 14px;">
      <div class="dangal-limit-info"><span>🎯 Random Muqabala today</span><span class="dangal-limit-count" id="dangalLimitCount">3 / 3 remaining</span></div>
      <div class="dangal-limit-track"><div class="dangal-limit-fill" id="dangalLimitFill" style="width:100%"></div></div>
    </div>
    <button class="dangal-action-btn" id="aiFindMuqabalaBtn" style="background:linear-gradient(135deg,var(--navy),#2A3158);width:100%;">🤖 Find with AI (any category)</button>
  `;
  sheet.classList.remove('hidden');requestAnimationFrame(()=>sheet.classList.add('open'));
  document.getElementById('closeQuizCatSheet').addEventListener('click',()=>{sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);});
  sheet.querySelectorAll('[data-cat]').forEach(card=>{
    card.addEventListener('click',()=>{
      const cat=card.dataset.cat;
      sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);
      if(dailyMuqabalaCount>=DAILY_MUQABALA_LIMIT){showToast('Daily limit reached! Try AI finder or a friend challenge instead 🎯');return;}
      useMuqabalaCredit();startMuqabala(null,cat);
    });
  });
  document.getElementById('aiFindMuqabalaBtn').addEventListener('click',()=>{
    sheet.classList.remove('open');setTimeout(()=>sheet.classList.add('hidden'),350);
    if(dailyMuqabalaCount>=DAILY_MUQABALA_LIMIT){showToast('Daily limit reached! Friend challenges are still unlimited 🎯');return;}
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
