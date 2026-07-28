// ===================== CATEGORY RATINGS + DANGAL GRID =====================
const NEWS_CATEGORIES = ['GK','Sports','Tech','Business','India','World'];
const CATEGORY_ICONS = {GK:'🧠',Sports:'🏏',Tech:'💻',Business:'📈',India:'🇮🇳',World:'🌍'};

const LEADERBOARD_PAGE=10;
let lbCursor=null;
let lbHasMore=false;
let lbEntries=[];
let lbLoading=false;
const LB_SAMPLE=[{name:'Riya S.',score:'15/15',profileType:'personal'},{name:'Dev K.',score:'14/15',profileType:'personal'},{name:'Priya N.',score:'13/15',profileType:'professional'},{name:'Arjun M.',score:'12/15',profileType:'personal'}];

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
    if(!db){
      // Offline demo only — never pretend sample rows are live scores.
      renderLeaderboardUI(LB_SAMPLE,el,{hasMore:false,demo:true});
      lbLoading=false;
      return;
    }
    let q=db.collection('daily_scores').doc(today).collection('scores').orderBy('score','desc');
    if(lbCursor) q=q.startAfter(lbCursor);
    q=q.limit(LEADERBOARD_PAGE);
    const snap=await q.get();
    if(reset&&snap.empty){renderLeaderboardEmpty(el);lbLoading=false;return;}
    const page=snap.docs.map(d=>{
      const data=d.data()||{};
      return {
        name:data.name?.split(' ')[0]||'Player',
        score:`${data.score}/${data.total||15}`,
        profileType:data.profileType||null,
        uid:d.id,
        __doc:d,
      };
    });
    if(reset) lbEntries=page; else lbEntries=lbEntries.concat(page);
    lbCursor=snap.docs.length?snap.docs[snap.docs.length-1]:null;
    lbHasMore=snap.docs.length>=LEADERBOARD_PAGE;
    if(typeof enrichUsersWithProfileType==='function') await enrichUsersWithProfileType(lbEntries);
    renderLeaderboardUI(lbEntries,el,{hasMore:lbHasMore});
  }catch(e){
    if(reset) renderLeaderboardEmpty(el);
  }finally{
    lbLoading=false;
  }
}

function renderLeaderboardEmpty(el){
  if(!el) return;
  el.removeAttribute('aria-busy');
  el.classList.remove('ui-skeleton-stack');
  const msg=typeof t==='function'?t('rp_lb_empty'):'No scores yet today — play Akhbaar to climb the board.';
  el.innerHTML=`<div class="rp-empty">${msg}</div>`;
}

function renderLeaderboardUI(entries,el,{hasMore=false,demo=false}={}){
  const medals=['🥇','🥈','🥉'];
  el.removeAttribute('aria-busy');
  el.classList.remove('ui-skeleton-stack');
  const youLabel=typeof t==='function'?t('rp_you'):'You';
  el.innerHTML=(demo?`<div class="rp-demo-hint">Demo</div>`:'')+entries.map((e,i)=>`
    <div class="rp-leaderboard-item">
      <div class="rp-rank ${i===0?'gold':''}">${medals[i]||i+1}</div>
      <div class="rp-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(e.name,e):e.name}</div>
      <div class="rp-score">${e.score}</div>
    </div>
  `).join('');
  const yourEl=document.getElementById('rpYourScore');
  const myScore=yourEl?.textContent;
  if(myScore&&myScore!=='—'){
    el.innerHTML+=`<div class="rp-leaderboard-item rp-leaderboard-you"><div class="rp-rank">${youLabel}</div><div class="rp-name">${userProfile?.name?.split(' ')[0]||youLabel}</div><div class="rp-score">${myScore}</div></div>`;
  }
  if(hasMore&&typeof ensureLoadMoreButton==='function'){
    ensureLoadMoreButton(el,{
      label:typeof t==='function'?t('rp_show_more'):'Show more',
      onLoadMore:()=>loadLeaderboardPage({reset:false}),
    });
  }
}

let _dangalGotdCache = null;

function dangalCalendarDateIST() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

async function fetchGameOfTheDay() {
  const today = dangalCalendarDateIST();
  if (_dangalGotdCache && _dangalGotdCache.date === today && _dangalGotdCache.gameId) {
    return _dangalGotdCache;
  }
  if (typeof apiFetch !== 'function') return null;
  try {
    const envelope = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: { action: 'get_game_of_day' },
    });
    if (envelope?.ok && envelope.data?.gameId) {
      _dangalGotdCache = {
        gameId: envelope.data.gameId,
        date: envelope.data.date || today,
      };
      return _dangalGotdCache;
    }
  } catch (e) {}
  return null;
}

async function recordDangalGameLike(gameId, btn) {
  if (!gameId || typeof apiFetch !== 'function') return;
  try {
    const envelope = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: { action: 'record_game_like', gameId },
    });
    if (envelope?.ok && btn) {
      btn.classList.add('is-liked');
      btn.setAttribute('aria-pressed', 'true');
      if (envelope.data?.alreadyLiked) {
        if (typeof showToast === 'function') showToast('Already liked');
      } else if (typeof showToast === 'function') {
        showToast('Liked');
      }
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('Could not like — try again');
  }
}

function dangalTileHtml(g) {
  const rating = typeof getGameRating === 'function' ? getGameRating(g.ratingKey) : null;
  const soloTag = g.solo || g.gameType === 'solo' ? '<span class="dangal-solo-tag">SOLO</span>' : '';
  const accent = (typeof GAME_ACCENTS !== 'undefined' && GAME_ACCENTS[g.id]) || 'var(--red)';
  return `<div class="dangal-game-tile" data-game="${g.id}" style="--tile-accent:${accent}">
    <div class="dangal-game-icon">${g.icon}</div>
    <div>
      <div class="dangal-game-name">${g.name}${soloTag}</div>
      <div class="dangal-game-desc">${g.desc}</div>
      ${rating ? `<div class="dangal-game-rating-pill">★ ${rating}</div>` : ''}
    </div>
    <button type="button" class="dangal-game-like" data-like-game="${g.id}" aria-label="Like ${g.name}">♥ Like</button>
  </div>`;
}

function wireDangalTiles(root) {
  (root || document).querySelectorAll('[data-game]').forEach((tile) => {
    tile.addEventListener('click', (e) => {
      if (e.target.closest('[data-like-game]')) return;
      if (typeof markGamePlayed === 'function') markGamePlayed(tile.dataset.game);
      if (typeof handleDangalGameTap === 'function') handleDangalGameTap(tile.dataset.game);
    });
  });
  (root || document).querySelectorAll('[data-like-game]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      recordDangalGameLike(btn.dataset.likeGame, btn);
    });
  });
}

function renderDangalContinueAndChips(host) {
  if (!host) return;
  let challengeChip = '';
  const pending = typeof consumeBeatScoreChallenge === 'function' ? consumeBeatScoreChallenge() : null;
  if (pending && pending.challenger) {
    const esc =
      typeof escapeHtmlText === 'function'
        ? escapeHtmlText
        : (s) =>
            String(s ?? '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
    const gName =
      pending.game === 'akhbaar'
        ? 'Akhbaar'
        : ((typeof getGame === 'function' && getGame(pending.game)?.name) || String(pending.game || 'quiz').slice(0, 40));
    const who = esc(String(pending.challenger).slice(0, 80));
    const scoreLabel =
      pending.score != null && Number.isFinite(Number(pending.score))
        ? String(Number(pending.score))
        : 'their score';
    challengeChip = `<button type="button" class="dangal-challenge-chip" id="dangalChallengeChip">
      <div><strong>${who} challenged you</strong><span>Beat ${esc(scoreLabel)} on ${esc(gName)}</span></div>
      <span>Play →</span>
    </button>`;
  }

  let continueChip = '';
  const last = typeof getLastPlayedGame === 'function' ? getLastPlayedGame() : null;
  if (last && last.id && typeof getGame === 'function') {
    const g = getGame(last.id === 'muqabala' ? 'quiz' : last.id);
    if (g) {
      continueChip = `<button type="button" class="dangal-continue-chip" id="dangalContinueChip" data-game="${g.id}">
        <div><strong>Continue · ${g.icon} ${g.name}</strong><span>Pick up where you left off</span></div>
        <span>→</span>
      </button>`;
    }
  }

  const wrap = document.createElement('div');
  wrap.className = 'dangal-chips';
  wrap.innerHTML = challengeChip + continueChip;
  host.appendChild(wrap);

  wrap.querySelector('#dangalChallengeChip')?.addEventListener('click', () => {
    if (!pending) return;
    if (pending.game === 'akhbaar') {
      window.__akhbaarBeatChallenge = { challenger: pending.challenger, score: pending.score };
      document.querySelectorAll('.tab-btn').forEach((b) => {
        if (b.dataset.tab === 'akhbaar') b.click();
      });
      setTimeout(() => {
        if (typeof applyAkhbaarBeatBanner === 'function') applyAkhbaarBeatBanner();
      }, 300);
      return;
    }
    if (pending.game === 'quiz' || pending.game === 'muqabala') {
      if (typeof startMuqabala === 'function') startMuqabala(pending.challenger, pending.cat || 'GK');
    } else if (typeof getGame === 'function') {
      const g = getGame(pending.game);
      if (g) g.launch({ source: 'challenge', beatScore: pending.score, challenger: pending.challenger });
    }
  });
  wrap.querySelector('#dangalContinueChip')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.game;
    if (typeof handleDangalGameTap === 'function') handleDangalGameTap(id);
  });
}

function renderDangalGotdSlot(host, gotd) {
  if (!host || !gotd?.gameId || typeof getGame !== 'function') return;
  const g = getGame(gotd.gameId);
  if (!g) return;
  const card = document.createElement('div');
  card.className = 'dangal-gotd';
  card.dataset.game = g.id;
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="dangal-gotd-icon">${g.icon}</div>
    <div>
      <div class="dangal-gotd-badge">Game of the Day</div>
      <div class="dangal-gotd-name">${g.name}</div>
      <div class="dangal-gotd-desc">${g.desc}</div>
    </div>
    <div class="dangal-gotd-actions">
      <span class="dangal-gotd-play">Play →</span>
      <button type="button" class="dangal-gotd-like" data-like-game="${g.id}" aria-label="Like ${g.name}">♥ Like</button>
    </div>`;
  const launch = () => {
    if (typeof markGamePlayed === 'function') markGamePlayed(g.id);
    if (typeof handleDangalGameTap === 'function') handleDangalGameTap(g.id);
  };
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-like-game]')) return;
    launch();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      launch();
    }
  });
  card.querySelector('[data-like-game]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    recordDangalGameLike(g.id, e.currentTarget);
  });
  host.appendChild(card);
}

function renderDangalGamesGrid() {
  const grid = document.getElementById('dangalGamesGrid');
  if (!grid) return;
  const overall = document.getElementById('dangalOverallRating');
  if (overall) {
    const quizRatings = userProfile?.categoryRatings || {};
    const avgQuiz = Math.round(
      NEWS_CATEGORIES.reduce((s, c) => s + (quizRatings[c] || 1200), 0) / NEWS_CATEGORIES.length
    );
    overall.innerHTML = `<span class="dor-label">Quiz Rating</span><span class="dor-val">${avgQuiz}</span>`;
  }

  const library = typeof getGames === 'function' ? getGames({ dangal: true }) : [];
  const solos = library.filter((g) => g.solo || g.gameType === 'solo');
  const vsFriend = library.filter((g) => !(g.solo || g.gameType === 'solo'));

  grid.innerHTML = '';
  renderDangalContinueAndChips(grid);

  const gotdHost = document.createElement('div');
  gotdHost.id = 'dangalGotdHost';
  grid.appendChild(gotdHost);
  fetchGameOfTheDay().then((gotd) => {
    if (!gotdHost.isConnected) return;
    gotdHost.innerHTML = '';
    renderDangalGotdSlot(gotdHost, gotd);
  });

  const sections = [
    { label: 'Quick solos', items: solos },
    { label: 'Vs friend', items: vsFriend },
  ];
  sections.forEach((sec) => {
    if (!sec.items.length) return;
    const section = document.createElement('div');
    section.className = 'dangal-section';
    section.innerHTML = `<div class="dangal-section-label">${sec.label}</div>
      <div class="dangal-section-grid">
        ${sec.items.map(dangalTileHtml).join('')}
      </div>`;
    grid.appendChild(section);
  });
  wireDangalTiles(grid);

  const boardHost = document.createElement('div');
  boardHost.id = 'dangalFriendsBoardHost';
  grid.appendChild(boardHost);
  if (typeof buildWeeklyFriendsBoard === 'function') {
    buildWeeklyFriendsBoard('chess')
      .then((rows) => {
        if (!rows || rows.length < 2 || !boardHost.isConnected) return;
        if (typeof weeklyFriendsBoardHtml === 'function') {
          boardHost.innerHTML = weeklyFriendsBoardHtml(rows);
        }
      })
      .catch(() => {});
  }
}

function getGameRating(key){
  if(!key)return null;
  const ratings=userProfile?.gameRatings||JSON.parse(localStorage.getItem('chaupaal_game_ratings')||'{}');
  return ratings[key]||1200;
}

async function recordGameResult(key,won,drew){
  if(!key)return;
  const ratings=JSON.parse(localStorage.getItem('chaupaal_game_ratings')||'{}');
  const cur=ratings[key]||1200;
  const delta=won?16:drew?2:-12;
  ratings[key]=Math.max(800,cur+delta);
  ratings[key+'_lastPlayed']=Date.now();
  localStorage.setItem('chaupaal_game_ratings',JSON.stringify(ratings));
  try{
    let u=typeof currentUser!=='undefined'?currentUser:null;
    if(!u&&window.ChaupaalEnv?.whenAuthReady){
      u=await window.ChaupaalEnv.whenAuthReady(10000);
    }
    if(db&&u){
      await db.collection('users').doc(u.uid).update({[`gameRatings.${key}`]:ratings[key]});
    }
  }catch(e){}
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
      <div class="rp-rating-row">
        <span class="rp-rating-cat">${CATEGORY_ICONS[cat]} ${cat}</span>
        <span class="rp-rating-val">${ratings[cat]||1200}</span>
      </div>
    `).join('');
  }
  loadLeaderboard();
}

document.getElementById('rpOpenAkhbaar')?.addEventListener('click',()=>{
  const tab=document.querySelector('.tab-btn[data-tab="akhbaar"]');
  if(tab) tab.click();
  else if(typeof switchTab==='function') switchTab('akhbaar');
});

document.getElementById('sidebarProfile')?.addEventListener('click',()=>{
  renderProfileModal();
  document.getElementById('profileModal').classList.remove('hidden');
});
