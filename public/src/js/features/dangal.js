// ===================== DANGAL / MUQABALA =====================
// ===================== DANGAL DAILY LIMIT =====================
const DAILY_MUQABALA_LIMIT = 3;
let dailyMuqabalaCount = parseInt(
  localStorage.getItem(`chaupaal_muqabala_${new Date().toISOString().split('T')[0]}`) || '0'
);

function updateLimitUI(){
  const remaining = Math.max(0, DAILY_MUQABALA_LIMIT - dailyMuqabalaCount);
  const pct = (remaining / DAILY_MUQABALA_LIMIT) * 100;
  const countEl = document.getElementById('dangalLimitCount');
  const fillEl = document.getElementById('dangalLimitFill');
  if(countEl) countEl.textContent = `${remaining} / ${DAILY_MUQABALA_LIMIT} remaining`;
  if(fillEl) fillEl.style.width = pct + '%';
}

function useMuqabalaCredit(){
  dailyMuqabalaCount++;
  localStorage.setItem(`chaupaal_muqabala_${new Date().toISOString().split('T')[0]}`, dailyMuqabalaCount);
  updateLimitUI();
}

// ===================== AI OPPONENT FINDER =====================
const UN_COUNTRIES=['Afghanistan','Australia','Bangladesh','Bhutan','Brazil','Canada','China','Egypt','France','Germany','India','Indonesia','Iran','Iraq','Israel','Italy','Japan','Kenya','Malaysia','Maldives','Mexico','Myanmar','Nepal','Netherlands','New Zealand','Nigeria','Pakistan','Philippines','Russia','Saudi Arabia','Singapore','South Africa','South Korea','Sri Lanka','Sweden','Switzerland','Thailand','Turkey','UAE','UK','USA','Vietnam'].sort();

const AI_FILTERS = {
  country: ['Any', ...UN_COUNTRIES],
  region: ['Any','North India','South India','East India','West India','Central India','Northeast India'],
  gender: ['Any','Male','Female','Non-binary'],
  age: ['18-22','23-28','29-35','36-45','45+','Any'],
  category: ['GK','Sports','Tech','Business','India','World','Mixed'],
  level: ['Beginner (< 1100)','Intermediate (1100-1400)','Advanced (> 1400)','Similar to me'],
};

let selectedFilters = {};

function openAIFinder(){
  const overlay = document.getElementById('aiFinder');
  overlay.classList.remove('hidden');
  requestAnimationFrame(()=>overlay.classList.add('open'));
  selectedFilters = {country:'India', category:'GK', level:'Similar to me'};

  overlay.innerHTML = `
    <div class="ai-finder-header">
      <div class="ai-finder-title">🤖 Find Your Opponent</div>
      <button class="icon-btn" id="closeAiFinder">✕</button>
    </div>
    <div class="ai-finder-body">
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.5;">
        Use filters or describe who you want to play against — AI will find the closest match in real time.
      </div>

      <div class="ai-filter-section">
        <div class="ai-filter-label">Country</div>
        <select class="modal-select" id="aiCountrySelect" style="margin-top:0;">
          ${AI_FILTERS.country.map(c=>`<option value="${c}" ${selectedFilters.country===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="ai-filter-section" id="aiRegionSection" style="${selectedFilters.country==='India'?'':'display:none;'}">
        <div class="ai-filter-label">Region (within India)</div>
        <div class="ai-filter-chips">
          ${AI_FILTERS.region.map(v=>`<button class="ai-filter-chip ${selectedFilters.region===v?'active':''}" data-key="region" data-val="${v}">${v}</button>`).join('')}
        </div>
      </div>

      ${Object.entries(AI_FILTERS).filter(([key])=>key!=='country'&&key!=='region').map(([key,vals])=>`
        <div class="ai-filter-section">
          <div class="ai-filter-label">${key.charAt(0).toUpperCase()+key.slice(1)}</div>
          <div class="ai-filter-chips">
            ${vals.map(v=>`<button class="ai-filter-chip ${selectedFilters[key]===v?'active':''}" data-key="${key}" data-val="${v}">${v}</button>`).join('')}
          </div>
        </div>
      `).join('')}

      <div class="ai-filter-section">
        <div class="ai-filter-label">Or describe in your own words</div>
        <div class="ai-chatbot-input-row">
          <input class="ai-chatbot-input" id="aiChatInput" placeholder="e.g. someone my age from Chennai who loves cricket...">
          <button class="ai-chatbot-send" id="aiChatSend">Ask</button>
        </div>
        <div id="aiChatResponse"></div>
      </div>

      <button class="find-with-filters-btn" id="findWithFiltersBtn">🔍 Find opponent with these filters</button>
    </div>
  `;

  document.getElementById('aiCountrySelect').addEventListener('change',(e)=>{
    selectedFilters.country=e.target.value;
    const regionSection=document.getElementById('aiRegionSection');
    if(regionSection) regionSection.style.display = e.target.value==='India' ? '' : 'none';
    if(e.target.value!=='India') delete selectedFilters.region;
  });

  document.getElementById('closeAiFinder').addEventListener('click',()=>{overlay.classList.remove('open');setTimeout(()=>overlay.classList.add('hidden'),350);});

  // Filter chip selection
  overlay.querySelectorAll('.ai-filter-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const {key,val} = chip.dataset;
      selectedFilters[key] = val;
      overlay.querySelectorAll(`.ai-filter-chip[data-key="${key}"]`).forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // AI chatbot input
  const sendAiChat = async () => {
    const input = document.getElementById('aiChatInput');
    const text = input?.value.trim();
    if(!text) return;
    const responseEl = document.getElementById('aiChatResponse');
    if(typeof isAiFeaturesEnabledSync==='function' && !isAiFeaturesEnabledSync()){
      if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">AI</div>${typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:'AI is temporarily paused. Use the filter chips below.'}</div>`;
      return;
    }
    if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">AI thinking...</div>Analysing your description...</div>`;

    try{
      const data = await callAI({
          tier:'fast', max_tokens:300, feature:'dangal_matchmaking',
          system:`You are a matchmaking assistant for Chaupaal, an Indian news quiz app. A user describes their ideal Muqabala opponent. Extract filters and return ONLY JSON: {"region":"...","country":"...","gender":"...","age":"...","category":"...","level":"...","summary":"one friendly sentence about who we will find"}. Use these options - region: ${AI_FILTERS.region.join('/')}, gender: ${AI_FILTERS.gender.join('/')}, age: ${AI_FILTERS.age.join('/')}, category: ${AI_FILTERS.category.join('/')}, level: ${AI_FILTERS.level.join('/')}. If not mentioned use "Any" or "Similar to me".`,
          messages:[{role:"user",content:text}]
        });
      const raw = data.text||data.content?.map(b=>b.text||'').join('')||'{}';
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
      Object.entries(parsed).forEach(([k,v])=>{if(k!=='summary'&&AI_FILTERS[k])selectedFilters[k]=v;});
      const summaryHtml = typeof renderMarkdown==='function'
        ? renderMarkdown(parsed.summary||'Looking for your ideal opponent...')
        : (parsed.summary||'Looking for your ideal opponent...');
      if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">🤖 AI understood</div><div class="ai-md">${summaryHtml}</div></div>`;
      overlay.querySelectorAll('.ai-filter-chip').forEach(chip=>{
        const {key,val}=chip.dataset;
        chip.classList.toggle('active',selectedFilters[key]===val);
      });
    }catch(e){
      const msg = (e&&e.code==='AI_DISABLED')
        ? (typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:e.message)
        : "Got it — I'll search with your description as a guide.";
      if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">AI</div>${msg}</div>`;
    }
  };

  document.getElementById('aiChatSend').addEventListener('click', sendAiChat);
  document.getElementById('aiChatInput').addEventListener('keypress',e=>{if(e.key==='Enter')sendAiChat();});

  document.getElementById('findWithFiltersBtn').addEventListener('click',()=>{
    overlay.classList.remove('open');
    setTimeout(()=>{overlay.classList.add('hidden');startSmartMatchmaking(selectedFilters);},350);
  });
}

// ===================== SMART MATCHMAKING =====================
function startSmartMatchmaking(filters){
  const panel = document.getElementById('panel-dangal');
  const statusEl = document.createElement('div');
  statusEl.className = 'matchmaking-status';
  statusEl.id = 'mmStatus';
  panel.appendChild(statusEl);

  let activeFilters = {...filters};
  let cancelled = false;
  let mmHandle = null;

  function renderStatus(hint){
    const filterSummary = Object.entries(activeFilters)
      .filter(([k,v])=>v&&v!=='Any'&&v!=='Similar to me'&&v!=='Mixed')
      .map(([k,v])=>`<span style="background:rgba(230,57,70,0.08);color:var(--red);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;">${v}</span>`)
      .join(' ');

    statusEl.innerHTML = `
      ${typeof skeletonHtml==='function'?skeletonHtml('match',1):'<div class="mm-spinner"></div>'}
      <div class="mm-title">${typeof t==='function'?t('matchmaking'):'Finding your opponent...'}</div>
      <div class="mm-sub">Searching with: ${filterSummary||'all filters'}</div>
      ${hint?`<div class="mm-filter-drop">${hint}</div>`:''}
      <button class="mm-cancel-btn" id="mmCancelBtn">Cancel</button>
    `;
    document.getElementById('mmCancelBtn').addEventListener('click',()=>{
      cancelled=true;
      try{ mmHandle?.cancel?.(); }catch(e){}
      statusEl.remove();
    });
  }

  function simNameFromFilters(){
    // Never invent Priya-style “human” names for simulated matches — Practice AI only.
    return 'Practice AI';
  }

  function launchFound(opp){
    if(cancelled) return;
    const simulated = !!opp?.simulated || !(opp?.uid && typeof isPersistableUid === 'function' && isPersistableUid(opp.uid));
    const name = simulated ? 'Practice AI' : (opp?.name || 'Opponent');
    const label = simulated
      ? `Practice vs AI · ${activeFilters.category||'GK'}`
      : `${name} · ${activeFilters.category||'GK'}`;
    statusEl.innerHTML = `
      <div style="font-size:52px;">🎯</div>
      <div class="mm-title">${simulated ? 'Practice ready' : (typeof t==='function'?t('found'):'Opponent found!')}</div>
      <div class="mm-sub">${label}</div>
    `;
    useMuqabalaCredit();
    setTimeout(()=>{
      statusEl.remove();
      startMuqabala(name, activeFilters.category||'GK', {opponentUid:simulated?null:(opp?.uid||null), simulated});
    }, 900);
  }

  renderStatus();
  if(typeof findRealOpponent!=='function'){
    launchFound({name:'Practice AI',simulated:true});
    return;
  }
  mmHandle = findRealOpponent(activeFilters, (opp)=>{
    if(cancelled) return;
    if(opp?.simulated){
      // Soften with progressive copy, then Practice AI (never fake human names)
      renderStatus('Widening search — Practice vs AI available');
      setTimeout(()=>{
        if(cancelled) return;
        launchFound({name:'Practice AI',simulated:true});
      }, 600);
      return;
    }
    launchFound(opp);
  }, ()=>{ cancelled=true; });
}

// ===== PEEPAL AI TARGET GROUP =====
// Patched onto openPeepalAskSheet after it is defined (see discovery.js)
function wirePeepalAskAiTarget(){
  const sheet = document.getElementById('peepalAskSheet');
  if(!sheet || sheet.dataset.aiTargetWired) return;
  sheet.dataset.aiTargetWired='1';

  const targetGroups = [];
  sheet.querySelectorAll('.peepal-target-chips .peepal-format-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      chip.classList.toggle('active');
      const g = chip.dataset.g;
      const idx = targetGroups.indexOf(g);
      if(idx>-1)targetGroups.splice(idx,1);else targetGroups.push(g);
    });
  });

  document.getElementById('peepalAiTargetBtn')?.addEventListener('click',async()=>{
    const qText = document.getElementById('peepalQText')?.value.trim();
    const resultEl = document.getElementById('peepalAiTargetResult');
    if(!resultEl)return;
    resultEl.classList.remove('hidden');
    if(typeof isAiFeaturesEnabled==='function' && !(await isAiFeaturesEnabled())){
      resultEl.textContent = typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:'AI is temporarily paused.';
      return;
    }
    resultEl.textContent = '🤖 Thinking...';
    try{
      const data = await callAI({
          tier:'fast', max_tokens:200, feature:'peepal_ai_target',
          system:`You are a content targeting assistant for Chaupaal, an Indian social news app. Given a question, suggest the most relevant target audience in 1-2 sentences. Be specific and friendly. Consider Indian demographics. Light markdown is OK.`,
          messages:[{role:"user",content:`Question: "${qText||'general question'}". Who should this reach?`}]
        });
      const text = data.text||data.content?.map(b=>b.text||'').join('')||'Best for general audience.';
      if(typeof renderMarkdown==='function'){
        resultEl.innerHTML = '🤖 <span class="ai-md">'+renderMarkdown(text)+'</span>';
      } else {
        resultEl.textContent = '🤖 ' + text;
      }
    }catch(e){
      resultEl.textContent = (e&&e.code==='AI_DISABLED')
        ? (typeof AI_DISABLED_MSG==='string'?AI_DISABLED_MSG:e.message)
        : '🤖 Best for general audience on Chaupaal.';
    }
  });
}

// init limit UI on load
updateLimitUI();

// ===================== MUQABALA ENGINE (unified content sources) =====================
const MUQABALA_TIMER_OPTIONS = [10, 15, 20, 30];
const MUQABALA_DEFAULT_TIMER = 20;
/** @type {Record<string, {questions: object[], timerSeconds: number, opponent: string, mode: string, source: string}>} */
window.__pendingMuqabalaChallenges = window.__pendingMuqabalaChallenges || {};

function normalizeMuqabalaOptions(opts){
  const o = opts && typeof opts === 'object' ? opts : {};
  let timer = Number(o.timerSeconds);
  if(!MUQABALA_TIMER_OPTIONS.includes(timer)) timer = MUQABALA_DEFAULT_TIMER;
  const questions = Array.isArray(o.questions) && o.questions.length
    ? o.questions.map(normalizeMuqabalaQuestion).filter(q=>q.q && q.options.length>=2)
    : null;
  return {
    questions,
    timerSeconds: timer,
    source: o.source || (questions ? 'manual' : 'bank'),
    skipMatchmaking: !!o.skipMatchmaking,
    skipCredit: !!o.skipCredit,
  };
}

function normalizeMuqabalaQuestion(q){
  if(!q || typeof q !== 'object') return { q:'', options:[], correct:null, philosophical:false };
  const options = Array.isArray(q.options)
    ? q.options.map(x=>String(x==null?'':x)).filter(Boolean).slice(0,4)
    : [];
  let correct = q.correct;
  if(correct != null){
    correct = parseInt(correct, 10);
    if(Number.isNaN(correct) || correct < 0 || correct >= options.length) correct = null;
  } else {
    correct = null;
  }
  return {
    q: String(q.q || q.text || '').trim(),
    options,
    correct,
    philosophical: !!q.philosophical,
  };
}

/** Category/static bank — prefer SAMPLE_* by category, fill from MUQABALA_QUESTIONS. */
function pickMuqabalaQuestions(mode, count){
  const n = Math.max(1, Math.min(20, count || 10));
  const cat = mode && !['Mixed','Rapid','Custom','AI'].includes(mode) ? mode : null;
  let pool = [];
  const pushCat = (arr)=>{
    if(!Array.isArray(arr)) return;
    arr.forEach(q=>{
      if(q.personal) return;
      if(cat && q.category && q.category !== cat) return;
      pool.push(q);
    });
  };
  if(typeof SAMPLE_QUESTIONS !== 'undefined') pushCat(SAMPLE_QUESTIONS);
  if(typeof SAMPLE_BONUS !== 'undefined') pushCat(SAMPLE_BONUS);
  if(typeof AKHBAAR_BANK !== 'undefined') pushCat(AKHBAAR_BANK);
  const bank = typeof MUQABALA_QUESTIONS !== 'undefined' ? MUQABALA_QUESTIONS : [];
  if(pool.length < n) pool = pool.concat(bank);
  if(!pool.length) pool = bank.slice();
  return [...pool].sort(()=>Math.random()-0.5).slice(0,n).map(normalizeMuqabalaQuestion);
}

/**
 * AI quiz generation for Muqabala. Returns null when AI is disabled (never throws for kill-switch).
 * @returns {Promise<object[]|null>}
 */
async function generateMuqabalaQuestionsAI({ category, count } = {}){
  const n = Math.max(1, Math.min(10, count || 5));
  const cat = category || 'GK';
  const aiOn = typeof isAiFeaturesEnabled === 'function'
    ? await isAiFeaturesEnabled()
    : (typeof isAiFeaturesEnabledSync === 'function' ? isAiFeaturesEnabledSync() : false);
  if(!aiOn) return null;
  if(typeof callAI !== 'function') return null;

  try{
    const data = await callAI({
      tier: 'fast',
      max_tokens: 1400,
      feature: 'muqabala_quiz_gen',
      system: `You generate multiple-choice quiz questions for Chaupaal Muqabala (Indian social news quiz). Return ONLY a JSON array of ${n} objects: [{"q":"question text","options":["A","B","C","D"],"correct":0}] where correct is the 0-based index of the right answer. Category focus: ${cat}. Keep options short. No markdown fences.`,
      messages: [{ role: 'user', content: `Generate ${n} ${cat} MCQ questions for a friendly Muqabala duel.` }],
    });
    const raw = (data.text || data.content?.map(b=>b.text||'').join('') || '').replace(/```json|```/g,'').trim();
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const jsonStr = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(jsonStr);
    if(!Array.isArray(parsed)) return null;
    const normalized = parsed.map(normalizeMuqabalaQuestion).filter(q=>q.q && q.options.length >= 2 && q.correct != null);
    return normalized.length ? normalized.slice(0, n) : null;
  }catch(e){
    if(e && e.code === 'AI_DISABLED') return null;
    console.warn('[muqabala] AI quiz gen failed', e);
    return null;
  }
}

/**
 * @param {string|null} opponentName
 * @param {string} mode - category / Custom / AI label
 * @param {object} [opts] - { questions, timerSeconds, source, skipMatchmaking, skipCredit }
 */
function startMuqabala(opponentName, mode, opts){
  const overlay = document.getElementById('muqabalaOverlay');
  if(!overlay){ showToast(t('muqabala_unavailable')); return; }
  if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'light',gameId:'muqabala'});
  const options = normalizeMuqabalaOptions(opts);
  const label = mode || 'GK';
  const qCount = options.questions ? options.questions.length : 10;
  overlay.classList.remove('hidden');
  let matchFound = false;
  let cancelled = false;
  let searchTimer = null;
  let startTimer = null;
  let unregisterSearchOverlay = null;

  const clearSearchTimers = ()=>{
    if(searchTimer){ clearTimeout(searchTimer); searchTimer = null; }
    if(startTimer){ clearTimeout(startTimer); startTimer = null; }
  };
  const releaseSearchScope = ()=>{
    if(!unregisterSearchOverlay) return;
    try{ unregisterSearchOverlay(); }catch(e){}
    unregisterSearchOverlay = null;
  };
  const cancelSearch = ()=>{
    cancelled = true;
    clearSearchTimers();
    releaseSearchScope();
    overlay.classList.add('hidden');
  };
  if(typeof registerScopedOverlay === 'function'){
    unregisterSearchOverlay = registerScopedOverlay(
      typeof OVERLAY_SCOPE_CHAT !== 'undefined' ? OVERLAY_SCOPE_CHAT : 'chat',
      overlay,
      cancelSearch
    );
  }

  const beginRun = (opp, runOpts)=>{
    if(cancelled) return;
    matchFound = true;
    const merged = Object.assign({}, options, runOpts || {});
    // Random/category: credit once at match confirm. Friend/custom challenges: unlimited.
    if(!opponentName && !merged.skipCredit) useMuqabalaCredit();
    startTimer = setTimeout(()=>{
      if(cancelled) return;
      releaseSearchScope();
      runMuqabala(overlay, opp, label, merged);
    }, merged.skipMatchmaking ? 400 : 900);
  };

  const practiceAiName = 'Practice AI';
  const launchCtx = window.__dangalLaunchCtx || {};
  const oppUid =
    options.opponentUid ||
    launchCtx.opponentUid ||
    '';
  const persistable =
    oppUid && typeof isPersistableUid === 'function' && isPersistableUid(oppUid);
  const liveReady =
    persistable &&
    !options.simulated &&
    (options.matchId || launchCtx.matchId || (typeof dangalMatchId === 'function'));

  if(options.skipMatchmaking){
    const displayOpp = persistable
      ? (opponentName || 'Opponent')
      : (options.simulated || !opponentName ? practiceAiName : opponentName);
    const sub = persistable
      ? (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel
          ? DangalLive.modeChromeLabel(true)
          : 'Live 1v1')
      : (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel
          ? DangalLive.modeChromeLabel(false, 'AI')
          : 'Practice vs AI');
    overlay.innerHTML = `
      ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Muqabala',subtitle:sub+' · '+label,backId:'closeMuqabala'}):`<div class="muqabala-header"><div class="muqabala-title">Muqabala — ${label}</div>${typeof backButtonHtml==='function'?backButtonHtml({ className: 'icon-btn', id: 'closeMuqabala' }):'<button class="icon-btn cp-back-btn" id="closeMuqabala" aria-label="Back"></button>'}</div>`}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
        <div style="font-size:48px;">🎯</div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${persistable?`Live vs ${displayOpp}`:`${sub}`}</div>
        <div style="font-size:13px;color:var(--muted);">${label} · ${qCount} questions · ${options.timerSeconds}s each</div>
      </div>
    `;
    document.getElementById('closeMuqabala').addEventListener('click',()=>{
      cancelSearch();
    });
    beginRun(displayOpp, {
      practice: !persistable,
      simulated: !persistable,
      opponentUid: persistable ? oppUid : '',
      matchId:
        options.matchId ||
        launchCtx.matchId ||
        (persistable && typeof dangalMatchId === 'function'
          ? dangalMatchId('quiz', { name: displayOpp, opponentUid: oppUid })
          : ''),
    });
    return;
  }

  overlay.innerHTML = `
    ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Muqabala',subtitle:label,backId:'closeMuqabala'}):`<div class="muqabala-header"><div class="muqabala-title">Muqabala — ${label}</div>${typeof backButtonHtml==='function'?backButtonHtml({ className: 'icon-btn', id: 'closeMuqabala' }):'<button class="icon-btn cp-back-btn" id="closeMuqabala" aria-label="Back"></button>'}</div>`}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
      <div style="font-size:48px;animation:pulse 1s ease-in-out infinite;">⚡</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${opponentName?`Waiting for ${opponentName}…`:'Finding a worthy opponent…'}</div>
      <div style="font-size:13px;color:var(--muted);">${opponentName?'Challenge sent — no fake accept. They must open it.':`${label} · ${qCount} questions · ${options.timerSeconds}s each`}</div>
      ${opponentName?`<button type="button" id="muqPracticeInstead" class="game-tap-target" style="margin-top:8px;padding:10px 18px;border-radius:12px;border:1px solid var(--line);background:rgba(0,0,0,.04);font:600 13px Space Grotesk,sans-serif;cursor:pointer;">Practice vs AI instead</button>`:''}
    </div>
  `;
  document.getElementById('closeMuqabala').addEventListener('click',()=>{
    cancelSearch();
    try{ mmHandle?.cancel?.(); }catch(e){}
    if(!matchFound) showToast(typeof t==='function'?t('muqabala_search_cancelled'):'Search cancelled — no Muqabala used 👍');
  });
  const practiceBtn = document.getElementById('muqPracticeInstead');
  if(practiceBtn){
    practiceBtn.addEventListener('click',()=>{
      if(cancelled) return;
      beginRun(practiceAiName, { practice:true, simulated:true, skipMatchmaking:true, opponentUid:'' });
    });
  }

  let mmHandle = null;
  if(opponentName){
    // Real friend challenge: stay on wait screen (accept arrives via challenge card / launch). No fake "accepted!".
    if(liveReady){
      beginRun(opponentName, {
        practice:false,
        simulated:false,
        opponentUid:oppUid,
        matchId:options.matchId || launchCtx.matchId || (typeof dangalMatchId === 'function' ? dangalMatchId('quiz', { name: opponentName, opponentUid: oppUid }) : ''),
      });
    }
    return;
  }

  // Live waiting-room match; Practice AI fallback when queue times out
  if(typeof findRealOpponent==='function'){
    mmHandle = findRealOpponent({category: mode||'GK'}, (opp)=>{
      if(cancelled) return;
      matchFound = true;
      const simulated = !!opp?.simulated || !(opp?.uid && typeof isPersistableUid === 'function' && isPersistableUid(opp.uid));
      const name = simulated ? practiceAiName : (opp?.name || 'Opponent');
      const body = overlay.children[1];
      if(body){
        body.innerHTML = `
          <div style="font-size:48px;">🎯</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${simulated?'Practice vs AI':name+' found!'}</div>
          <div style="font-size:13px;color:var(--muted);">Starting now…</div>
        `;
      }
      beginRun(name, {
        practice: simulated,
        simulated,
        opponentUid: simulated ? '' : (opp.uid || ''),
        matchId: !simulated && typeof dangalMatchId === 'function' ? dangalMatchId('quiz', { name, opponentUid: opp.uid }) : '',
      });
    }, ()=>{ cancelled=true; });
  } else {
    searchTimer = setTimeout(()=>{
      if(cancelled) return;
      beginRun(practiceAiName, { practice:true, simulated:true });
    }, 1800);
  }
}

function runMuqabala(overlay, oppName, mode, opts){
  const options = normalizeMuqabalaOptions(opts);
  const launchCtx = window.__dangalLaunchCtx || {};
  const oppUid = options.opponentUid || launchCtx.opponentUid || '';
  const matchId =
    options.matchId ||
    launchCtx.matchId ||
    (typeof dangalMatchId === 'function' ? dangalMatchId('quiz', { name: oppName, opponentUid: oppUid }) : ('quiz_' + Date.now()));
  const practice =
    options.practice === true ||
    options.simulated === true ||
    !(oppUid && typeof isPersistableUid === 'function' && isPersistableUid(oppUid));
  const liveChat = {
    name: oppName,
    dangalMatchId: matchId,
    dangalSource: options.source || launchCtx.source || '',
  };
  if(oppUid){
    try{
      window.__dangalLaunchCtx = Object.assign({}, launchCtx, {
        matchId,
        opponentUid: oppUid,
        mode: practice ? 'practice' : 'live',
        stake: Number(options.stake || launchCtx.stake) || 0,
      });
    }catch(e){}
  }
  const stake = practice ? 0 : (Number(options.stake || launchCtx.stake) || 0);
  const liveOn =
    !practice &&
    typeof DangalLive !== 'undefined' &&
    DangalLive.isLive(liveChat, window.__dangalLaunchCtx);
  const liveRoles = liveOn && DangalLive.roles ? DangalLive.roles(liveChat, window.__dangalLaunchCtx) : null;
  let liveHandle = null;
  let questionsReady = !liveOn;
  let remoteAnswers = {};
  let remoteScores = {};

  let questions = options.questions && options.questions.length
    ? options.questions
    : pickMuqabalaQuestions(mode, 10);
  const timerSeconds = options.timerSeconds;
  const totalQ = questions.length;
  let qIdx = 0, myScore = 0, oppScore = 0, timerInterval = null;
  let streak = 0, bestStreak = 0, comboFlash = '';
  const philosophicalAnswers = [];
  let sessionEnded = false;
  let sessionResult = null;
  const modeChrome = liveOn
    ? (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel ? DangalLive.modeChromeLabel(true) : 'Live 1v1')
    : (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel ? DangalLive.modeChromeLabel(false, 'AI') : 'Practice vs AI');
  const displayOpp = practice && (!oppName || /priya/i.test(String(oppName))) ? 'Practice AI' : oppName;

  let session = null;
  if(typeof createGameSession === 'function'){
    session = createGameSession({
      id: matchId,
      type: 'quiz',
      title: 'Muqabala',
      mode: String(mode || 'GK'),
      context: {
        opponent: displayOpp,
        source: options.source,
        timerSeconds,
        overlayScope: typeof OVERLAY_SCOPE_CHAT !== 'undefined' ? OVERLAY_SCOPE_CHAT : 'chat',
        matchId,
        opponentUid: practice ? '' : oppUid,
        live: liveOn,
        stake,
      },
      stake,
      mount(){
        return overlay;
      },
      removeOnCleanup: false,
      end(result){
        sessionResult = result;
      },
      cleanup(){
        if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
        if(liveHandle){
          try{ liveHandle.leave({ forfeit: !sessionEnded || ['dismissed','aborted','quit'].includes(sessionResult) }); }catch(e){}
          liveHandle = null;
        }
        if(['dismissed','aborted','quit','error'].includes(sessionResult)){
          overlay.classList.add('hidden');
        }
      },
    });
    try{ session.init(); }catch(e){ console.warn('[muqabala] session init', e); }
  }

  function endSession(result){
    if(sessionEnded) return;
    sessionEnded = true;
    if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
    if(liveHandle && (result === 'win' || result === 'loss' || result === 'draw')){
      try{
        liveHandle.setStatus('over', result === 'draw' ? null : (result === 'win' ? (liveRoles && liveRoles.me) : (liveRoles && liveRoles.opp)));
      }catch(e){}
    }
    if(session && typeof session.end === 'function'){
      try{ session.end(result); }catch(e){}
      session = null;
    }
  }

  function closeOverlay(result){
    endSession(result || 'dismissed');
    overlay.classList.add('hidden');
  }

  function noteAnswer(correct){
    if(correct){
      streak++;
      if(streak > bestStreak) bestStreak = streak;
      if(streak >= 2){
        comboFlash = streak >= 4 ? `${streak}× streak!` : `Combo ×${streak}`;
        if(typeof gameFeedback === 'function') gameFeedback(streak >= 3 ? 'place' : 'valid');
      } else {
        comboFlash = '';
        if(typeof gameFeedback === 'function') gameFeedback('valid');
      }
    } else {
      streak = 0;
      comboFlash = '';
      if(typeof gameFeedback === 'function') gameFeedback('invalid');
    }
  }

  function pushLiveAnswer(qi, choice, correct){
    if(!liveOn || !liveHandle || !liveRoles) return;
    const answers = Object.assign({}, remoteAnswers);
    const mine = Object.assign({}, answers[liveRoles.me] || {});
    mine[qi] = { choice, correct: !!correct, at: Date.now() };
    answers[liveRoles.me] = mine;
    const scores = Object.assign({}, remoteScores);
    scores[liveRoles.me] = myScore;
    scores[liveRoles.opp] = oppScore;
    liveHandle.push({
      quiz: {
        questions: questions.map((q)=>({ q:q.q, options:q.options, correct:q.correct, philosophical:!!q.philosophical })),
        answers,
        scores,
        qIdx: qi,
      },
      status: 'playing',
    });
  }

  function syncOppFromRemote(){
    if(!liveRoles) return;
    const oppAns = remoteAnswers[liveRoles.opp] || {};
    const entry = oppAns[qIdx];
    if(entry){
      oppScore = Number(remoteScores[liveRoles.opp]) || Object.keys(oppAns).filter((k)=>oppAns[k] && oppAns[k].correct).length;
      return entry;
    }
    return null;
  }

  if(liveOn && liveRoles && typeof DangalLive !== 'undefined'){
    const seedQs = (liveRoles.host ? questions : null);
    liveHandle = DangalLive.join({
      gameType: 'quiz',
      matchId,
      me: liveRoles.me,
      playerA: liveRoles.playerA,
      playerB: liveRoles.playerB,
      quizSeed: seedQs
        ? {
            questions: seedQs.map((q)=>({ q:q.q, options:q.options, correct:q.correct, philosophical:!!q.philosophical })),
            answers: {},
            scores: {},
            qIdx: 0,
          }
        : null,
      onSnap(val){
        if(!val || !val.quiz) return;
        const qz = val.quiz;
        if(Array.isArray(qz.questions) && qz.questions.length && !liveRoles.host){
          questions = qz.questions;
          questionsReady = true;
        }
        if(liveRoles.host) questionsReady = true;
        remoteAnswers = qz.answers || {};
        remoteScores = qz.scores || {};
        if(remoteScores[liveRoles.opp] != null) oppScore = Number(remoteScores[liveRoles.opp]) || oppScore;
        if(val.status === 'forfeit' && !sessionEnded){
          const iWon = val.winner === liveRoles.me;
          showMuqabalaResult(overlay, myScore, iWon ? myScore + 1 : Math.max(0, myScore - 1), displayOpp, mode, philosophicalAnswers, options, endSession, { bestStreak, forfeit: true });
        }
      },
    });
  }

  function renderQ(){
    if(liveOn && !questionsReady){
      overlay.innerHTML = `
        ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Muqabala',subtitle:modeChrome,backId:'closeMuqabala2'}):''}
        <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;">
          <div style="font:700 16px Space Grotesk,sans-serif;">Syncing quiz…</div>
          <div style="font-size:13px;color:var(--muted);">Waiting for host questions</div>
        </div>`;
      const b=document.getElementById('closeMuqabala2');
      if(b)b.addEventListener('click',()=>closeOverlay('dismissed'));
      setTimeout(()=>{ if(!sessionEnded) renderQ(); }, 400);
      return;
    }
    if(qIdx >= questions.length){
      return showMuqabalaResult(overlay, myScore, oppScore, displayOpp, mode, philosophicalAnswers, options, endSession, { bestStreak });
    }
    const data = questions[qIdx];
    let timeLeft = data.philosophical ? 999 : timerSeconds;
    let answered = false;
    let timerPaused = false;
    const urgencyAt = Math.max(3, Math.ceil(timerSeconds * 0.35));

    overlay.innerHTML = `
      ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Muqabala',subtitle:`${modeChrome} · Q${qIdx+1}/${totalQ} · ${mode}`,backId:'closeMuqabala2'}):`<div class="muqabala-header"><div class="muqabala-title">Q${qIdx+1}/${totalQ} · ${mode}</div>${typeof backButtonHtml==='function'?backButtonHtml({ className: 'icon-btn', id: 'closeMuqabala2' }):'<button class="icon-btn cp-back-btn" id="closeMuqabala2" aria-label="Back"></button>'}</div>`}
      ${typeof gameScoreHtml==='function'?gameScoreHtml({label:t('you')||'You',score:myScore},{label:displayOpp,score:oppScore}):`<div class="vs-row"><div class="player-chip me">${t('you')||'You'} — ${myScore}</div><div class="player-chip opp">${displayOpp} — ${oppScore}</div></div>`}
      <div class="muqabala-timer${data.philosophical?'':' muqabala-timer--live'}" id="mTimer" style="${data.philosophical?'font-size:14px;color:var(--gold);':''}">
        ${data.philosophical?t('philosophical_label'):`${timeLeft}`}
      </div>
      <div class="muqabala-combo" id="mCombo"${comboFlash?'':' hidden'}>${comboFlash||''}</div>
      <div class="muqabala-card">
        <div class="q-text">${data.q}</div>
        <div class="options" id="mOpts">
          ${data.options.map((o,i)=>`<button class="opt" data-i="${i}"><span>${o}</span><span class="mark"></span></button>`).join('')}
        </div>
        ${data.philosophical?`
          <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px;">
            <div style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:8px;">${t('type_answer')}</div>
            <textarea id="philoTypeInput" placeholder="${t('type_placeholder')}" rows="3" style="width:100%;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font-family:Inter,sans-serif;font-size:13px;outline:none;resize:none;"></textarea>
            <button id="philoSendBtn" style="margin-top:8px;width:100%;padding:10px;background:var(--red);color:#fff;border:none;border-radius:10px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">${t('send')}</button>
          </div>
          <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:10px;">${t('philosophical_score_note')}</div>
        `:''}
        <div class="opp-indicator" id="oppInd">${liveOn?`${displayOpp} answering…`:t('opp_thinking',{name:displayOpp})}</div>
      </div>
    `;

    document.getElementById('closeMuqabala2').addEventListener('click',()=>closeOverlay('dismissed'));

    const optBtns = overlay.querySelectorAll('.opt');
    const tickTimerUi = ()=>{
      const tmr = overlay.querySelector('#mTimer');
      if(!tmr || data.philosophical) return;
      tmr.textContent = timeLeft;
      tmr.classList.toggle('muqabala-timer--urgent', timeLeft <= urgencyAt);
      tmr.classList.toggle('muqabala-timer--critical', timeLeft <= 3);
    };

    const advanceAfterAnswer = ()=>{
      const go = ()=>{ qIdx++; renderQ(); };
      if(!liveOn){ setTimeout(go, 900); return; }
      let waits = 0;
      const poll = setInterval(()=>{
        waits++;
        const remote = syncOppFromRemote();
        const oi = overlay.querySelector('#oppInd');
        if(remote){
          if(oi) oi.textContent = remote.correct ? t('opp_correct',{name:displayOpp}) : t('opp_wrong',{name:displayOpp});
        }
        if(remote || waits > 40){
          clearInterval(poll);
          setTimeout(go, 500);
        }
      }, 250);
    };

    if(data.philosophical){
      optBtns.forEach(btn=>btn.addEventListener('click',()=>{
        if(answered)return; answered=true; clearInterval(timerInterval);
        const chosen=parseInt(btn.dataset.i,10);
        const chosenText=data.options[chosen];
        philosophicalAnswers.push({q:data.q,answer:chosenText});
        if(typeof updatePersonalityFromAurSunao==='function') updatePersonalityFromAurSunao(data.q,chosenText);
        optBtns.forEach(b=>{b.disabled=true;b.classList.add('correct');b.querySelector('.mark').textContent='✓';});
        noteAnswer(true);
        if(!quietMode && typeof SoundLib!=='undefined') SoundLib.playFeedback(true,'default');
        const oi=overlay.querySelector('#oppInd');if(oi)oi.textContent=t('opp_correct',{name:displayOpp});
        myScore++;
        pushLiveAnswer(qIdx, chosen, true);
        setTimeout(()=>{qIdx++;renderQ();},1400);
      }));

      const typeInput=overlay.querySelector('#philoTypeInput');
      const sendBtn=overlay.querySelector('#philoSendBtn');
      if(typeInput){
        typeInput.addEventListener('focus',()=>{
          timerPaused=true;
          const t2=overlay.querySelector('#mTimer');
          if(t2)t2.textContent=t('timer_paused');
        });
        typeInput.addEventListener('blur',()=>{ timerPaused=false; });
        sendBtn?.addEventListener('click',()=>{
          const typed=typeInput.value.trim();
          if(!typed)return;
          if(!answered){ answered=true; clearInterval(timerInterval); }
          philosophicalAnswers.push({q:data.q,answer:typed,typed:true});
          if(typeof updatePersonalityFromAurSunao==='function') updatePersonalityFromAurSunao(data.q,typed);
          optBtns.forEach(b=>{b.disabled=true;b.classList.add('dim');});
          noteAnswer(true);
          if(!quietMode && typeof SoundLib!=='undefined') SoundLib.playFeedback(true,'default');
          myScore++;
          pushLiveAnswer(qIdx, -1, true);
          setTimeout(()=>{qIdx++;renderQ();},1400);
        });
      }
    } else {
      optBtns.forEach(btn=>btn.addEventListener('click',()=>{
        if(answered)return; answered=true; clearInterval(timerInterval);
        const chosen=parseInt(btn.dataset.i,10);
        const isCorrect=data.correct!==null&&chosen===data.correct;
        if(isCorrect)myScore++;
        noteAnswer(isCorrect);
        optBtns.forEach(b=>b.disabled=true);
        optBtns.forEach((b,i)=>{
          if(i===data.correct){b.classList.add('correct');b.querySelector('.mark').textContent='✓';}
          else if(i===chosen&&!isCorrect){b.classList.add('wrong');b.querySelector('.mark').textContent='✕';}
          else b.classList.add('dim');
        });
        if(!quietMode && typeof SoundLib!=='undefined') SoundLib.playFeedback(isCorrect,'default');
        const comboEl=overlay.querySelector('#mCombo');
        if(comboEl){
          if(comboFlash){comboEl.hidden=false;comboEl.textContent=comboFlash;comboEl.classList.add('muqabala-combo--pop');}
          else {comboEl.hidden=true;comboEl.textContent='';}
        }
        pushLiveAnswer(qIdx, chosen, isCorrect);
        if(liveOn){
          const oi=overlay.querySelector('#oppInd');
          const already=syncOppFromRemote();
          if(oi) oi.textContent = already
            ? (already.correct ? t('opp_correct',{name:displayOpp}) : t('opp_wrong',{name:displayOpp}))
            : `${displayOpp} answering…`;
          advanceAfterAnswer();
          return;
        }
        const oi=overlay.querySelector('#oppInd');
        const oppCorrectLocal=Math.random()<0.55;
        if(oi)oi.textContent=oppCorrectLocal?t('opp_correct',{name:displayOpp}):t('opp_wrong',{name:displayOpp});
        if(oppCorrectLocal)oppScore++;
        setTimeout(()=>{qIdx++;renderQ();},900);
      }));

      if(!liveOn){
        const oppCapMs = Math.max(2000, (timerSeconds - 2) * 1000);
        const oppDelay=1200+Math.random()*Math.max(1000, oppCapMs - 1200);
        const oppCorrect=Math.random()<0.55;
        setTimeout(()=>{
          const oi=overlay.querySelector('#oppInd');
          if(oi&&!answered)oi.textContent=oppCorrect?t('opp_correct',{name:displayOpp}):t('opp_wrong',{name:displayOpp});
          if(oppCorrect && !answered) oppScore++;
        }, Math.min(oppDelay, oppCapMs));
      } else {
        const livePoll = setInterval(()=>{
          if(answered){ clearInterval(livePoll); return; }
          const remote = syncOppFromRemote();
          if(remote){
            const oi=overlay.querySelector('#oppInd');
            if(oi) oi.textContent = remote.correct ? t('opp_correct',{name:displayOpp}) : t('opp_wrong',{name:displayOpp});
          }
        }, 300);
      }

      tickTimerUi();
      timerInterval=setInterval(()=>{
        if(timerPaused)return;
        timeLeft--;
        tickTimerUi();
        if(timeLeft<=0){
          clearInterval(timerInterval);
          if(!answered){
            answered=true;
            noteAnswer(false);
            optBtns.forEach(b=>{b.disabled=true;b.classList.add('dim');});
            if(data.correct!==null){const c=optBtns[data.correct];if(c){c.classList.remove('dim');c.classList.add('correct');c.querySelector('.mark').textContent='✓';}}
            pushLiveAnswer(qIdx, -1, false);
            if(liveOn) advanceAfterAnswer();
            else setTimeout(()=>{qIdx++;renderQ();},900);
          }
        }
      },1000);
    }
  }
  renderQ();
}

function showMuqabalaResult(overlay,myScore,oppScore,oppName,mode,philosophicalAnswers,opts,endSession,extra){
  const options = normalizeMuqabalaOptions(opts);
  const stats = extra || {};
  const won=myScore>oppScore,tie=myScore===oppScore;
  const resultKey = tie ? 'draw' : (won ? 'win' : 'loss');
  if(typeof endSession === 'function') endSession(resultKey);
  if(typeof gameFeedback === 'function') gameFeedback(tie?'draw':(won?'win':'lose'));
  if(typeof setGamePB==='function') setGamePB('quiz', myScore);
  if(typeof recordGameResult==='function') recordGameResult('quiz', won, tie, { score: myScore });
  else if(typeof recordDangalSession==='function') recordDangalSession('quiz', { won, drew: tie, score: myScore });
  const vsBest = typeof formatVsBest==='function'?formatVsBest('quiz', myScore):'';
  const duel = typeof recordDuelStreak==='function'?recordDuelStreak(oppName, won, tie):null;
  const duelLine = duel && duel.streak > 1 ? `Duel streak · ${duel.streak}` : '';

  const nudge=philosophicalAnswers.length>0 && typeof NUDGES_POST_MUQABALA!=='undefined'
    ? NUDGES_POST_MUQABALA[Math.floor(Math.random()*NUDGES_POST_MUQABALA.length)].replace('{answer}',philosophicalAnswers[0].answer)
    : 'Ek acha muqabala tha! Kuch aur baatein karein?';
  const streakLine = [stats.bestStreak > 1 ? `Best combo · ${stats.bestStreak}` : '', duelLine].filter(Boolean).join(' · ');
  const shareStats = {
    scoreLine: `${myScore} – ${oppScore}`,
    score: myScore,
    meta: `${won?'Victory':tie?'Draw':'Close fight'} · ${mode}${streakLine?` · ${streakLine}`:''}`,
    vs: `You vs ${oppName}`,
    cat: mode,
    text: `Chaupaal Muqabala (${mode}): ${myScore}–${oppScore} vs ${oppName}${stats.bestStreak>1?` · streak ${stats.bestStreak}`:''}${won?' · I won!':tie?' · Draw':''}`,
  };
  const shareCard = typeof buildGameShareCard==='function'
    ? buildGameShareCard('quiz', shareStats)
    : '';

  overlay.innerHTML=`
    ${typeof gameChromeHtml==='function'?gameChromeHtml({title:'Muqabala',subtitle:'Game over',backId:'closeMuqabala3'}):`<div class="muqabala-header"><div class="muqabala-title">Muqabala over!</div>${typeof backButtonHtml==='function'?backButtonHtml({ className: 'icon-btn', id: 'closeMuqabala3' }):'<button class="icon-btn cp-back-btn" id="closeMuqabala3" aria-label="Back"></button>'}</div>`}
    ${typeof gameResultHtml==='function'?gameResultHtml({
      gameId:'quiz',
      glyph:tie?'=':won?'✓':'·',
      title:tie?"It's a tie":(won?'You won':`${oppName} won`),
      subtitle:streakLine||undefined,
      vsBest: vsBest||undefined,
      you:myScore,opp:oppScore,oppLabel:oppName,
      shareCardHtml: shareCard,
      actions:[
        {label:'Play again',primary:true,id:'again'},
        {label:'Share',primary:false,id:'share'},
        {label:'Challenge friend',primary:false,id:'challenge'},
        {label:'Post to story',primary:false,id:'story'},
        {label:`Chat with ${oppName}`,primary:false,id:'chat'},
      ],
    }):`<div class="muqabala-result"><div>${tie?"It's a tie!":(won?'You won!':`${oppName} won`)}</div></div>`}
    ${philosophicalAnswers.length>0?`<div class="nudge-box" style="margin:0 16px 16px;"><div class="nudge-label">Baithak mein baat karein</div><div class="nudge-text">${nudge}</div></div>`:''}
  `;
  document.getElementById('closeMuqabala3').addEventListener('click',()=>overlay.classList.add('hidden'));
  if(typeof wireGameResultActions==='function'){
    wireGameResultActions(overlay,{
      again:()=>{
        startMuqabala(oppName, mode, {
          questions: options.questions || undefined,
          timerSeconds: options.timerSeconds,
          source: options.source,
          skipMatchmaking: options.source === 'manual' || options.source === 'ai',
        });
      },
      share:()=>{
        if(typeof shareGameResult==='function') shareGameResult('quiz', shareStats);
        else if(typeof generateChallengeLink==='function') generateChallengeLink(myScore,mode);
      },
      challenge: async ()=>{
        if(typeof openFriendPickerSheet==='function'){
          const friend=await openFriendPickerSheet({title:'Challenge a friend',subtitle:'Start a Muqabala'});
          if(friend){
            startMuqabala(friend.name, mode, {skipMatchmaking:true, source:'friend'});
          }
        } else if(typeof generateChallengeLink==='function'){
          generateChallengeLink(myScore,mode);
        }
      },
      story:()=>{
        if(typeof postGameScoreStory==='function'){
          postGameScoreStory('quiz',{score:myScore,total:10,scoreLine:`${myScore}–${oppScore}`,meta:mode,text:shareStats.text});
        }
      },
      chat:()=>{overlay.classList.add('hidden');showToast(t('muqabala_check_baithak'));},
    });
  }
  if(myScore>0 && typeof broadcastDuelResult==='function') setTimeout(()=>broadcastDuelResult(oppName,myScore,oppScore),600);
}

/** Launch a stored custom challenge by id (chat bubble Answer button). */
function launchPendingMuqabalaChallenge(challengeId){
  window.__pendingMuqabalaChallenges = window.__pendingMuqabalaChallenges || {};
  let payload = window.__pendingMuqabalaChallenges[challengeId];
  if(!payload){
    try{
      const raw=localStorage.getItem('chaupaal_challenge_'+challengeId);
      if(raw) payload=JSON.parse(raw);
    }catch(e){}
  }
  // Recover from Firestore-backed attachment on the button's bubble if needed
  if((!payload || !payload.questions) && typeof document!=='undefined'){
    const btn=document.querySelector(`[data-muqabala-challenge="${challengeId}"]`);
    const row=btn?.closest('.msg-row');
    // Questions may be on a data attribute via rehydrate below — handled in wireChallengeBubble path
  }
  if(!payload || !payload.questions || !payload.questions.length){
    showToast(t('muqabala_challenge_expired'));
    return;
  }
  window.__pendingMuqabalaChallenges[challengeId]=payload;
  startMuqabala(payload.opponent || null, payload.mode || 'Custom', {
    questions: payload.questions,
    timerSeconds: payload.timerSeconds,
    source: payload.source || 'manual',
    skipMatchmaking: true,
  });
}
