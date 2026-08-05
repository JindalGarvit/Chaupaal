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
        genre: envelope.data.genre || null,
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
  const genreHint =
    g.genre && typeof genreLabel === 'function'
      ? `<span class="dangal-genre-tag">${genreLabel(g.genre)}</span>`
      : '';
  const accent = (typeof GAME_ACCENTS !== 'undefined' && GAME_ACCENTS[g.id]) || 'var(--red)';
  const progressPill =
    typeof tileProgressPillHtml === 'function' ? tileProgressPillHtml(g.id) : '';
  return `<div class="dangal-game-tile" data-game="${g.id}" style="--tile-accent:${accent}">
    <div class="dangal-game-icon">${g.icon}</div>
    <div>
      <div class="dangal-game-name">${g.name}${soloTag}</div>
      <div class="dangal-game-desc">${g.desc}</div>
      ${genreHint}
      ${rating ? `<div class="dangal-game-rating-pill">★ ${rating}</div>` : ''}
      ${progressPill}
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
    const gName =
      pending.game === 'akhbaar'
        ? 'Akhbaar'
        : ((typeof getGame === 'function' && getGame(pending.game)?.name) || pending.game);
    challengeChip = `<button type="button" class="dangal-challenge-chip" id="dangalChallengeChip">
      <div><strong>${pending.challenger} challenged you</strong><span>Beat ${pending.score != null ? pending.score : 'their score'} on ${gName}</span></div>
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
  const genreBit =
    (gotd.genre || g.genre) && typeof genreLabel === 'function'
      ? `<div class="dangal-gotd-desc">${genreLabel(gotd.genre || g.genre)}</div>`
      : '';
  card.innerHTML = `
    <div class="dangal-gotd-icon">${g.icon}</div>
    <div>
      <div class="dangal-gotd-badge">Game of the Day</div>
      <div class="dangal-gotd-name">${g.name}</div>
      <div class="dangal-gotd-desc">${g.desc}</div>
      ${genreBit}
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
    const hub = typeof getDangalHubSummary === 'function' ? getDangalHubSummary() : null;
    const streakBit =
      hub && hub.softDayStreak > 0
        ? `<span class="dor-meta">${hub.softDayStreak > 1 ? `${hub.softDayStreak}-day streak` : 'Played today'} · ${hub.weekPlays} this week</span>`
        : hub
          ? `<span class="dor-meta">${hub.weekPlays} play${hub.weekPlays === 1 ? '' : 's'} this week</span>`
          : '';
    overall.innerHTML = `<div class="dor-main"><span class="dor-label">Quiz Rating</span><span class="dor-val">${avgQuiz}</span></div>${streakBit}`;
  }

  const library = typeof getGames === 'function' ? getGames({ dangal: true }) : [];

  grid.innerHTML = '';
  renderDangalContinueAndChips(grid);

  if (typeof dangalHubProgressHtml === 'function') {
    const progressHost = document.createElement('div');
    progressHost.className = 'dangal-progress-host';
    progressHost.innerHTML = dangalHubProgressHtml();
    grid.appendChild(progressHost);
    if (typeof wireDangalProgressPanel === 'function') wireDangalProgressPanel(progressHost);
  }

  // Mode hint: Khel ← Manch → Maidan — removed (swipe + morph only)

  // ── Khel: Game of the Day ──
  const khel = document.createElement('div');
  khel.className = 'dangal-section room-kit room-kit--fire room-kit--khel';
  khel.dataset.dangalSection = 'khel';
  const gotdHost = document.createElement('div');
  gotdHost.id = 'dangalGotdHost';
  khel.appendChild(gotdHost);
  grid.appendChild(khel);
  fetchGameOfTheDay().then((gotd) => {
    if (!gotdHost.isConnected) return;
    gotdHost.innerHTML = '';
    if (gotd?.gameId) {
      try {
        window.__dangalGotdId = gotd.gameId;
      } catch (e) {}
    }
    renderDangalGotdSlot(gotdHost, gotd);
    if (!gotd?.gameId && typeof renderEmptyState === 'function') {
      renderEmptyState(gotdHost, {
        icon: '🔥',
        title: 'Khel is warming up',
        message: 'Today’s featured game will land here.',
      });
    }
  });

  // ── Manch: full games library + sticky filters ──
  const manch = document.createElement('div');
  manch.className = 'dangal-section room-kit room-kit--fire room-kit--manch';
  manch.dataset.dangalSection = 'manch';
  const filterBar = document.createElement('div');
  filterBar.className = 'dangal-manch-filters';
  filterBar.setAttribute('data-nav-ignore', '1');
  filterBar.setAttribute('role', 'toolbar');
  filterBar.setAttribute('aria-label', 'Filter games');
  const modeFilters = [
    { id: 'all', label: 'All', kind: 'all', icon: '▦', color: '#546E7A' },
    { id: 'solo', label: 'Solo', kind: 'mode', gameType: 'solo', icon: '①', color: '#00897B' },
    { id: 'dual', label: 'Dual', kind: 'mode', gameType: 'dual', icon: '②', color: '#F9A825' },
    { id: 'multiplayer', label: 'Multi', kind: 'mode', gameType: 'multiplayer', icon: '③', color: '#E53935' },
  ];
  const genreFilters = (typeof getGameGenres === 'function' ? getGameGenres() : []).map((g) => ({
    id: g.id,
    label: g.label,
    kind: 'genre',
    genre: g.id,
    icon: g.icon || '🎮',
    color: g.color || '#E85D04',
  }));
  const allFilters = modeFilters.concat(genreFilters);
  if (!window.__dangalManchFilter) window.__dangalManchFilter = { mode: 'all', genre: null };
  const state = window.__dangalManchFilter;

  const chipsHtml = allFilters
    .map((f) => {
      const active =
        f.kind === 'all'
          ? state.mode === 'all' && !state.genre
          : f.kind === 'mode'
            ? state.mode === f.gameType && !state.genre
            : state.genre === f.genre;
      const tint = f.color || '#E85D04';
      return `<button type="button" class="dangal-filter-chip${active ? ' is-active' : ''}" data-filter-kind="${f.kind}" data-filter-id="${f.id}"${f.gameType ? ` data-game-type="${f.gameType}"` : ''}${f.genre ? ` data-genre="${f.genre}"` : ''} style="--chip-tint:${tint}"><span class="dangal-filter-ico" aria-hidden="true">${f.icon || ''}</span>${f.label}</button>`;
    })
    .join('');
  filterBar.innerHTML = `<div class="dangal-filter-row" data-swipe-ignore="1">${chipsHtml}</div>`;
  manch.appendChild(filterBar);

  const manchGrid = document.createElement('div');
  manchGrid.className = 'dangal-section-grid';
  manchGrid.dataset.manchGrid = '1';
  if (state.mode !== 'all' || state.genre) {
    manchGrid.dataset.swipeIgnore = '1';
  }

  function filteredLibrary() {
    let list = library.slice();
    if (state.genre) list = list.filter((g) => g.genre === state.genre);
    else if (state.mode && state.mode !== 'all') {
      list = list.filter((g) => g.gameType === state.mode);
    }
    return list;
  }

  function paintManchGrid() {
    const list = filteredLibrary();
    if (!list.length) {
      manchGrid.innerHTML = '';
      if (typeof renderEmptyState === 'function') {
        renderEmptyState(manchGrid, {
          icon: '🎮',
          title: 'No games here',
          message: 'Try another filter — or All to see everything.',
        });
      } else {
        manchGrid.innerHTML =
          '<div class="cp-empty" style="grid-column:1/-1;padding:20px;text-align:center;color:var(--muted);">No games match this filter.</div>';
      }
    } else {
      manchGrid.innerHTML = list.map(dangalTileHtml).join('');
      wireDangalTiles(manchGrid);
    }
  }

  paintManchGrid();
  manch.appendChild(manchGrid);

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter-kind]');
    if (!btn) return;
    const kind = btn.dataset.filterKind;
    if (kind === 'all') {
      state.mode = 'all';
      state.genre = null;
    } else if (kind === 'mode') {
      state.mode = btn.dataset.gameType || 'all';
      state.genre = null;
    } else if (kind === 'genre') {
      state.genre = btn.dataset.genre || null;
      state.mode = 'all';
    }
    filterBar.querySelectorAll('.dangal-filter-chip').forEach((c) => {
      const k = c.dataset.filterKind;
      let on = false;
      if (k === 'all') on = state.mode === 'all' && !state.genre;
      else if (k === 'mode') on = !state.genre && state.mode === c.dataset.gameType;
      else if (k === 'genre') on = state.genre === c.dataset.genre;
      c.classList.toggle('is-active', on);
    });
    // Filter active → block section swipe from filtered grid; All restores it
    if (state.mode !== 'all' || state.genre) manchGrid.dataset.swipeIgnore = '1';
    else delete manchGrid.dataset.swipeIgnore;
    paintManchGrid();
  });

  grid.appendChild(manch);

  // ── Maidan: resume / last played / in-progress ──
  const maidan = document.createElement('div');
  maidan.className = 'dangal-section room-kit room-kit--fire room-kit--maidan';
  maidan.dataset.dangalSection = 'maidan';
  const last = typeof getLastPlayedGame === 'function' ? getLastPlayedGame() : null;
  const lastGame =
    last && last.id && typeof getGame === 'function'
      ? getGame(last.id === 'muqabala' ? 'quiz' : last.id)
      : null;
  maidan.innerHTML = ``;
  const maidanBody = document.createElement('div');
  maidanBody.className = 'dangal-section-grid dangal-maidan-actions';
  if (lastGame) {
    maidanBody.innerHTML = `
      <button type="button" class="btn btn--primary dangal-action-btn" data-dangal-resume="${lastGame.id}">
        Resume · ${lastGame.icon || ''} ${lastGame.name}
      </button>
      <button type="button" class="btn dangal-action-btn" data-dangal-maidan="muqabala">Open Muqabala</button>
      <button type="button" class="btn dangal-action-btn" data-dangal-maidan="finder">Find opponent</button>`;
  } else {
    maidanBody.innerHTML = `
      <div class="cp-empty" style="padding:16px;text-align:center;color:var(--muted);grid-column:1/-1;">
        No game in progress — pick something from Manch.
      </div>
      <button type="button" class="btn btn--primary dangal-action-btn" data-dangal-maidan="muqabala">Open Muqabala</button>
      <button type="button" class="btn dangal-action-btn" data-dangal-maidan="finder">Find opponent</button>`;
  }
  maidan.appendChild(maidanBody);
  grid.appendChild(maidan);

  wireDangalTiles(grid);
  maidan.querySelector('[data-dangal-resume]')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.dangalResume;
    if (typeof handleDangalGameTap === 'function') handleDangalGameTap(id);
  });
  grid.querySelectorAll('[data-dangal-maidan="muqabala"]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById('aiFindMuqabalaBtn')?.click() || openQuizCategorySheet());
  });
  grid.querySelectorAll('[data-dangal-maidan="finder"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof openAIFinder === 'function') openAIFinder();
    });
  });

  const boardHost = document.createElement('div');
  boardHost.id = 'dangalFriendsBoardHost';
  boardHost.dataset.dangalSection = 'maidan';
  maidan.appendChild(boardHost);
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

  // Apply current section visibility + swipe
  setDangalSection(dangalSection || 'manch', { silent: true });
  wireDangalSwipe();
}

let dangalSection = 'manch';
function setDangalSection(section, opts) {
  dangalSection = ['khel', 'manch', 'maidan'].includes(section) ? section : 'manch';
  const host = document.getElementById('dangalGamesGrid');
  if (!host) {
    if (typeof renderDangalGamesGrid === 'function') renderDangalGamesGrid();
    return;
  }
  host.querySelectorAll('[data-dangal-section]').forEach((el) => {
    const match = el.dataset.dangalSection === dangalSection;
    el.style.display = match ? '' : 'none';
  });
  // Keep chips / progress visible across rooms
  host.querySelectorAll('.dangal-chips, .dangal-progress-host').forEach((el) => {
    el.style.display = '';
  });
  document.querySelectorAll('.dangal-mode-hint').forEach((el) => el.remove());
  const screen = document.getElementById('dangalScreen') || document.getElementById('panel-dangal');
  if (screen) {
    [...screen.classList].filter((c) => c.startsWith('room-kit')).forEach((c) => screen.classList.remove(c));
    screen.classList.add('room-kit', 'room-kit--fire', `room-kit--${dangalSection}`);
  }
  if (!opts?.silent) {
    // Quiet: no toast on section change (morph / swipe are enough)
  }
  const target = host.querySelector(`[data-dangal-section="${dangalSection}"]`);
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}
window.setDangalSection = setDangalSection;

function wireDangalSwipe() {
  const screen = document.getElementById('dangalScreen') || document.getElementById('panel-dangal');
  if (!screen || screen.dataset.swipeWired) return;
  screen.dataset.swipeWired = '1';
  let sx = 0;
  let sy = 0;
  let locked = null;
  let ignored = false;

  function dangalSwipeIgnored(target) {
    try {
      if (
        target?.closest?.(
          '.dangal-manch-filters, .dangal-filter-row, .dangal-filter-chip, [data-swipe-ignore], [data-nav-ignore="1"]'
        )
      ) {
        return true;
      }
      // With a Manch genre/mode filter active, ignore swipes from the filtered grid
      const state = window.__dangalManchFilter;
      const filtered = state && (state.mode !== 'all' || state.genre);
      if (filtered && target?.closest?.('[data-manch-grid], .dangal-section-grid')) return true;
    } catch (e) {}
    return false;
  }

  screen.addEventListener(
    'touchstart',
    (e) => {
      ignored = dangalSwipeIgnored(e.target);
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      locked = null;
    },
    { passive: true }
  );
  screen.addEventListener(
    'touchmove',
    (e) => {
      if (ignored) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (!locked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
    },
    { passive: true }
  );
  screen.addEventListener(
    'touchend',
    (e) => {
      if (ignored || locked !== 'h') return;
      const dx = (e.changedTouches[0]?.clientX || 0) - sx;
      if (Math.abs(dx) < 56) return;
      const order = ['khel', 'manch', 'maidan'];
      const cur = order.indexOf(dangalSection);
      const next = order[Math.max(0, Math.min(2, cur + (dx < 0 ? 1 : -1)))];
      setDangalSection(next);
    },
    { passive: true }
  );
}

function getGameRating(key){
  if(!key)return null;
  const ratings=userProfile?.gameRatings||JSON.parse(localStorage.getItem('chaupaal_game_ratings')||'{}');
  return ratings[key]||1200;
}

async function recordGameResult(key,won,drew,extra){
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
  if(typeof recordDangalSession==='function'){
    const e=extra&&typeof extra==='object'?extra:{};
    const scoreOnly=!!e.scoreOnly||key==='rushrunner';
    recordDangalSession(key,{
      won:scoreOnly?(won?true:undefined):!!won,
      drew:!!drew,
      score:e.score,
      scoreOnly,
      gotd:!!e.gotd,
    });
  }
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
