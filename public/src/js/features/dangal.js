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
    if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">AI thinking...</div>Analysing your description...</div>`;

    try{
      const data = await callAnthropic({
          model:"claude-haiku-4-5-20251001",max_tokens:300,
          system:`You are a matchmaking assistant for Chaupaal, an Indian news quiz app. A user describes their ideal Muqabala opponent. Extract filters and return ONLY JSON: {"region":"...","country":"...","gender":"...","age":"...","category":"...","level":"...","summary":"one friendly sentence about who we will find"}. Use these options - region: ${AI_FILTERS.region.join('/')}, gender: ${AI_FILTERS.gender.join('/')}, age: ${AI_FILTERS.age.join('/')}, category: ${AI_FILTERS.category.join('/')}, level: ${AI_FILTERS.level.join('/')}. If not mentioned use "Any" or "Similar to me".`,
          messages:[{role:"user",content:text}]
        });
      const raw = data.content?.map(b=>b.text||'').join('')||'{}';
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
      // Apply extracted filters
      Object.entries(parsed).forEach(([k,v])=>{if(k!=='summary'&&AI_FILTERS[k])selectedFilters[k]=v;});
      if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">🤖 AI understood</div>${parsed.summary||'Looking for your ideal opponent...'}</div>`;
      // Refresh chips
      overlay.querySelectorAll('.ai-filter-chip').forEach(chip=>{
        const {key,val}=chip.dataset;
        chip.classList.toggle('active',selectedFilters[key]===val);
      });
    }catch(e){
      if(responseEl) responseEl.innerHTML = `<div class="ai-chatbot-response"><div class="ai-label">AI</div>Got it — I'll search with your description as a guide.</div>`;
    }
  };

  document.getElementById('aiChatSend').addEventListener('click', sendAiChat);
  document.getElementById('aiChatInput').addEventListener('keypress',e=>{if(e.key==='Enter')sendAiChat();});

  document.getElementById('findWithFiltersBtn').addEventListener('click',()=>{
    overlay.classList.remove('open');
    setTimeout(()=>{overlay.classList.add('hidden');startSmartMatchmaking(selectedFilters);},350);
  });
}

// ===================== SMART MATCHMAKING WITH PROGRESSIVE FILTER DROPPING =====================
const FILTER_PRIORITY = ['level','age','gender','region','country','category'];

function startSmartMatchmaking(filters){
  const panel = document.getElementById('panel-dangal');
  const statusEl = document.createElement('div');
  statusEl.className = 'matchmaking-status';
  statusEl.id = 'mmStatus';
  panel.appendChild(statusEl);

  let activeFilters = {...filters};
  let filtersToTry = FILTER_PRIORITY.filter(f=>activeFilters[f]&&activeFilters[f]!=='Any'&&activeFilters[f]!=='Similar to me'&&activeFilters[f]!=='Mixed');
  let attempt = 0;
  let cancelled = false;

  function renderStatus(dropping=null){
    const filterSummary = Object.entries(activeFilters)
      .filter(([k,v])=>v&&v!=='Any'&&v!=='Similar to me'&&v!=='Mixed')
      .map(([k,v])=>`<span style="background:rgba(230,57,70,0.08);color:var(--red);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;">${v}</span>`)
      .join(' ');

    // Skeleton (not a bare spinner) keeps the status area content-shaped while we search.
    statusEl.innerHTML = `
      ${typeof skeletonHtml==='function'?skeletonHtml('match',1):'<div class="mm-spinner"></div>'}
      <div class="mm-title">Finding your opponent...</div>
      <div class="mm-sub">Searching with: ${filterSummary||'all filters'}</div>
      ${dropping?`<div class="mm-filter-drop">⚠️ Hard to find — dropping "<strong>${dropping}</strong>" filter to widen search</div>`:''}
      <button class="mm-cancel-btn" id="mmCancelBtn">Cancel</button>
    `;
    document.getElementById('mmCancelBtn').addEventListener('click',()=>{
      cancelled=true;statusEl.remove();
    });
  }

  async function tryMatch(){
    if(cancelled)return;
    renderStatus();

    // Simulate search delay (in production: real Firestore query with filters)
    await new Promise(r=>setTimeout(r,2000 + Math.random()*1000));
    if(cancelled)return;

    // Simulate: harder filters = lower match chance
    const matchChance = Math.max(0.3, 1 - (filtersToTry.length * 0.15));
    const found = Math.random() < matchChance || filtersToTry.length === 0;

    if(found){
      // Found — generate opponent name based on filters
      const regionNames = {
        'South India':['Priya','Arjun','Deepa','Kiran','Ananya'],
        'North India':['Rahul','Priyanka','Vikram','Neha','Amit'],
        'East India':['Sourav','Ritika','Debashish','Puja','Aritra'],
        'West India':['Riya','Dev','Sneha','Rohan','Kavya'],
      };
      const pool = regionNames[activeFilters.region]||['Priya','Arjun','Riya','Dev','Neha'];
      const oppName = pool[Math.floor(Math.random()*pool.length)] + '_' + Math.floor(Math.random()*99);

      statusEl.innerHTML = `
        <div style="font-size:52px;">🎯</div>
        <div class="mm-title">Opponent found!</div>
        <div class="mm-sub">${oppName} · ${activeFilters.region||'India'} · ${activeFilters.category||'GK'}</div>
      `;
      useMuqabalaCredit();
      setTimeout(()=>{ statusEl.remove(); startMuqabala(oppName, activeFilters.category||'GK'); }, 900);
    } else {
      // Drop lowest-priority active filter
      if(filtersToTry.length>0){
        const toDrop = filtersToTry[filtersToTry.length-1];
        filtersToTry.pop();
        delete activeFilters[toDrop];
        renderStatus(toDrop);
        await new Promise(r=>setTimeout(r,1500));
        attempt++;
        tryMatch();
      } else {
        // No more filters to drop — found with defaults
        statusEl.innerHTML = `
          <div style="font-size:52px;">🎯</div>
          <div class="mm-title">Found a match!</div>
          <div class="mm-sub">Best available opponent based on your preferences</div>
        `;
        useMuqabalaCredit();
        setTimeout(()=>{ statusEl.remove(); startMuqabala('Priya_29','GK'); }, 900);
      }
    }
  }

  tryMatch();
}

// ===================== PEEPAL USER SEARCH =====================
document.getElementById('peepalSearchBtn')?.addEventListener('click',()=>{
  const search = document.getElementById('peepalUserSearch');
  search.classList.toggle('hidden');
  if(!search.classList.contains('hidden')) document.getElementById('peepalUserInput')?.focus();
});

document.getElementById('peepalUserInput')?.addEventListener('input', async (e)=>{
  const q = e.target.value.trim();
  const results = document.getElementById('peepalUserResults');
  if(!results)return;
  if(!q){ results.innerHTML=''; return; }

  if(typeof universalSearch==='function'){
    const { results: hits } = await universalSearch(q, { types:['users'], limit: 6 });
    results.innerHTML = hits.length
      ? hits.map(u=>`
        <div class="peepal-us-card">
          <div class="pu-avatar">${u.photoURL?`<img src="${u.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:'👤'}</div>
          <div class="pu-info"><div class="pu-name">${u.name||u.username}</div><div class="pu-meta">@${u.username||'user'}${u.city?' · '+u.city:''}</div></div>
          <button class="pu-add" data-uid="${u.uid||''}" data-uname="${u.username||''}" data-name="${u.name||''}">View</button>
        </div>`).join('')
      : '<div style="color:var(--muted);font-size:13px;padding:4px 0;">No users found</div>';
    results.querySelectorAll('.pu-add').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(btn.dataset.uname&&typeof navigateToDeepLink==='function') navigateToDeepLink('profile', btn.dataset.uname);
        else showToast(`@${btn.dataset.uname||btn.dataset.name}`);
      });
    });
    return;
  }

  // Offline fallback samples
  const sampleUsers=[
    {name:'Riya Sharma',avatar:'😊',city:'Mumbai',username:'riya_s'},
    {name:'Arjun Mehta',avatar:'🏔️',city:'Delhi',username:'arjun_m'},
    {name:'Priya Nair',avatar:'👩',city:'Bengaluru',username:'priya_n'},
    {name:'Dev Sharma',avatar:'👨',city:'Pune',username:'dev_s'},
    {name:'Kavya Reddy',avatar:'👩‍💼',city:'Hyderabad',username:'kavya_r'},
  ].filter(u=>u.name.toLowerCase().includes(q.toLowerCase())||u.username.toLowerCase().includes(q.toLowerCase()));

  results.innerHTML = sampleUsers.slice(0,4).map(u=>`
    <div class="peepal-us-card">
      <div class="pu-avatar">${u.avatar}</div>
      <div class="pu-info"><div class="pu-name">${u.name}</div><div class="pu-meta">@${u.username} · ${u.city}</div></div>
      <button class="pu-add" data-uname="${u.username}" data-name="${u.name}">+ Add</button>
    </div>
  `).join('') || '<div style="color:var(--muted);font-size:13px;padding:4px 0;">No users found</div>';

  results.querySelectorAll('.pu-add').forEach(btn=>{
    btn.addEventListener('click',()=>{
      btn.textContent='Added ✓';btn.style.background='rgba(51,196,129,0.1)';btn.style.color='var(--green)';
      showToast(`${btn.dataset.name} added as friend! 🎉`);
    });
  });
});

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
    resultEl.textContent = '🤖 Thinking...';
    try{
      const data = await callAnthropic({
          model:"claude-haiku-4-5-20251001",max_tokens:200,
          system:`You are a content targeting assistant for Chaupaal, an Indian social news app. Given a question, suggest the most relevant target audience in 1-2 sentences. Be specific and friendly. Consider Indian demographics.`,
          messages:[{role:"user",content:`Question: "${qText||'general question'}". Who should this reach?`}]
        });
      resultEl.textContent = '🤖 ' + (data.content?.map(b=>b.text||'').join('')||'Best for general audience.');
    }catch(e){ resultEl.textContent = '🤖 Best for general audience on Chaupaal.'; }
  });
}

// init limit UI on load
updateLimitUI();

function startMuqabala(opponentName,mode){
  const overlay=document.getElementById('muqabalaOverlay');
  overlay.classList.remove('hidden');
  let matchFound=false; // track whether we found a match before user cancels

  overlay.innerHTML=`
    <div class="muqabala-header">
      <div class="muqabala-title">⚔️ Muqabala — ${mode}</div>
      <button class="icon-btn" id="closeMuqabala">✕</button>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
      <div style="font-size:48px;animation:pulse 1s ease-in-out infinite;">⚡</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${opponentName?`Sending challenge to ${opponentName}…`:'Finding a worthy opponent…'}</div>
      <div style="font-size:13px;color:var(--muted);">${mode} · 10 questions · 15s each</div>
    </div>
  `;
  // Cancel during search = no credit used
  document.getElementById('closeMuqabala').addEventListener('click',()=>{
    if(!matchFound) showToast('Search cancelled — no Muqabala used 👍');
    overlay.classList.add('hidden');
  });

  const delay=opponentName?2800:1800;
  setTimeout(()=>{
    const opp=opponentName||'Priya_29';
    overlay.querySelector('div:nth-child(2)').innerHTML=`
      <div style="font-size:48px;">🎯</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">${opponentName?`${opp} accepted!`:`${opp} found!`}</div>
      <div style="font-size:13px;color:var(--muted);">Starting now…</div>
    `;
    // Credit used HERE — match confirmed, game about to start
    matchFound=true;
    if(!opponentName) useMuqabalaCredit(); // only for random, not friend challenges
    setTimeout(()=>runMuqabala(overlay,opp,mode),900);
  },delay);
}

function runMuqabala(overlay,oppName,mode){
  const questions=[...MUQABALA_QUESTIONS].sort(()=>Math.random()-0.5).slice(0,10);
  let qIdx=0,myScore=0,oppScore=0,timerInterval=null;
  const philosophicalAnswers=[];

  function renderQ(){
    if(qIdx>=questions.length)return showMuqabalaResult(overlay,myScore,oppScore,oppName,mode,philosophicalAnswers);
    const data=questions[qIdx];
    let timeLeft=data.philosophical?999:15; // no countdown for philosophical
    let answered=false;
    let timerPaused=false;

    overlay.innerHTML=`
      <div class="muqabala-header">
        <div class="muqabala-title">Q${qIdx+1}/10 · ${mode}</div>
        <button class="icon-btn" id="closeMuqabala2">✕</button>
      </div>
      <div class="vs-row">
        <div class="player-chip me">🧑 ${t('you')||'You'} — ${myScore}</div>
        <div class="vs-label">${t('vs')}</div>
        <div class="player-chip opp">🎯 ${oppName} — ${oppScore}</div>
      </div>
      <div class="muqabala-timer" id="mTimer" style="${data.philosophical?'font-size:14px;color:var(--gold);':''}">
        ${data.philosophical?t('philosophical_label'):`${timeLeft}`}
      </div>
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
        <div class="opp-indicator" id="oppInd">${t('opp_thinking',{name:oppName})}</div>
      </div>
    `;

    document.getElementById('closeMuqabala2').addEventListener('click',()=>{clearInterval(timerInterval);overlay.classList.add('hidden');});

    const optBtns=overlay.querySelectorAll('.opt');

    // Philosophical: all options go green, record answer, feed personality
    if(data.philosophical){
      optBtns.forEach(btn=>btn.addEventListener('click',()=>{
        if(answered)return; answered=true; clearInterval(timerInterval);
        const chosen=parseInt(btn.dataset.i);
        const chosenText=data.options[chosen];
        philosophicalAnswers.push({q:data.q,answer:chosenText});
        updatePersonalityFromAurSunao(data.q,chosenText);
        optBtns.forEach(b=>{b.disabled=true;b.classList.add('correct');b.querySelector('.mark').textContent='✓';});
        if(!quietMode)SoundLib.playFeedback(true,'default');
        const oi=overlay.querySelector('#oppInd');if(oi)oi.textContent=t('opp_correct',{name:oppName});
        myScore++; // philosophical always scores
        setTimeout(()=>{qIdx++;renderQ();},1400);
      }));

      // Type-in option: pause timer, collect text
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
          updatePersonalityFromAurSunao(data.q,typed);
          optBtns.forEach(b=>{b.disabled=true;b.classList.add('dim');});
          if(!quietMode)SoundLib.playFeedback(true,'default');
          myScore++;
          setTimeout(()=>{qIdx++;renderQ();},1400);
        });
      }
    } else {
      // Regular question
      optBtns.forEach(btn=>btn.addEventListener('click',()=>{
        if(answered)return; answered=true; clearInterval(timerInterval);
        const chosen=parseInt(btn.dataset.i);
        const isCorrect=data.correct!==null&&chosen===data.correct;
        if(isCorrect)myScore++;
        optBtns.forEach(b=>b.disabled=true);
        optBtns.forEach((b,i)=>{
          if(i===data.correct){b.classList.add('correct');b.querySelector('.mark').textContent='✓';}
          else if(i===chosen&&!isCorrect){b.classList.add('wrong');b.querySelector('.mark').textContent='✕';}
          else b.classList.add('dim');
        });
        if(!quietMode)SoundLib.playFeedback(isCorrect,'default');
        const oi=overlay.querySelector('#oppInd');
        const oppCorrectLocal=Math.random()<0.62;
        if(oi)oi.textContent=oppCorrectLocal?t('opp_correct',{name:oppName}):t('opp_wrong',{name:oppName});
        if(oppCorrectLocal)oppScore++;
        setTimeout(()=>{qIdx++;renderQ();},900);
      }));

      // Simulated opponent for non-philosophical
      const oppDelay=1200+Math.random()*10000;
      const oppCorrect=Math.random()<0.62;
      setTimeout(()=>{const oi=overlay.querySelector('#oppInd');if(oi&&!answered)oi.textContent=oppCorrect?t('opp_correct',{name:oppName}):t('opp_wrong',{name:oppName});if(oppCorrect)oppScore++;},Math.min(oppDelay,13000));

      // Countdown timer — pauses while user types
      timerInterval=setInterval(()=>{
        if(timerPaused)return;
        timeLeft--;
        const tmr=overlay.querySelector('#mTimer');
        if(tmr)tmr.textContent=timeLeft;
        if(timeLeft<=0){
          clearInterval(timerInterval);
          if(!answered){
            answered=true;
            optBtns.forEach(b=>{b.disabled=true;b.classList.add('dim');});
            if(data.correct!==null){const c=optBtns[data.correct];if(c){c.classList.remove('dim');c.classList.add('correct');c.querySelector('.mark').textContent='✓';}}
          }
          setTimeout(()=>{qIdx++;renderQ();},900);
        }
      },1000);
    }
  }
  renderQ();
}

function showMuqabalaResult(overlay,myScore,oppScore,oppName,mode,philosophicalAnswers){
  const won=myScore>oppScore,tie=myScore===oppScore;
  const nudge=philosophicalAnswers.length>0?NUDGES_POST_MUQABALA[Math.floor(Math.random()*NUDGES_POST_MUQABALA.length)].replace('{answer}',philosophicalAnswers[0].answer):'Ek acha muqabala tha! Kuch aur baatein karein? 😊';
  overlay.innerHTML=`
    <div class="muqabala-header">
      <div class="muqabala-title">⚔️ Muqabala khatam!</div>
      <button class="icon-btn" id="closeMuqabala3">✕</button>
    </div>
    <div class="muqabala-result">
      <div style="text-align:center;font-size:48px;">${tie?'🤝':won?'🏆':'😅'}</div>
      <div style="text-align:center;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">${tie?"It's a tie!":(won?"You won!":`${oppName} won this time`)}</div>
      <div class="result-row ${won?'win':tie?'':'loss'}"><span>🧑 Aap</span><span>${myScore}</span></div>
      <div class="result-row"><span>🎯 ${oppName}</span><span>${oppScore}</span></div>
      ${philosophicalAnswers.length>0?`<div class="nudge-box"><div class="nudge-label">💬 Baithak mein baat karein</div><div class="nudge-text">${nudge}</div></div>`:''}
      <button class="chat-start-btn" id="startChatBtn">💬 Chat with ${oppName}</button>
      <button style="margin-top:8px;width:100%;padding:13px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;" id="rematchBtn">🔁 Rematch</button>
    </div>
  `;
  document.getElementById('closeMuqabala3').addEventListener('click',()=>overlay.classList.add('hidden'));
  document.getElementById('rematchBtn').addEventListener('click',()=>startMuqabala(oppName,mode));
  document.getElementById('startChatBtn').addEventListener('click',()=>{overlay.classList.add('hidden');showToast('Check Baithak for your chat! 🏠');});
  // Viral challenge link
  const shareBtn=document.createElement('button');
  shareBtn.style.cssText='margin-top:8px;width:100%;padding:13px;background:var(--cream);color:var(--ink);border:2px solid var(--line);border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;';
  shareBtn.textContent='🔗 Challenge others to beat your score';
  shareBtn.addEventListener('click',()=>generateChallengeLink(myScore,mode));
  overlay.querySelector('.muqabala-result').appendChild(shareBtn);
  // Broadcast to groups
  if(myScore>0) setTimeout(()=>broadcastDuelResult(oppName,myScore,oppScore),600);
}
