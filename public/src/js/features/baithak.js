// ===================== BAITHAK INIT =====================
function initBaithak(){
  const storiesRow=document.getElementById('storiesRow');
  if(!storiesRow)return;
  if(!storiesRow.dataset.wired){
    storiesRow.dataset.wired='1';
    document.getElementById('baithakFab')?.addEventListener('click',showNewChatOptions);
    document.getElementById('newChatBtn')?.addEventListener('click',showNewChatOptions);
    const addStoryBtn=document.getElementById('addStoryBtn');
    addStoryBtn?.addEventListener('click',()=>{
      if(addStoryBtn.dataset.suppressClick==='1'){
        addStoryBtn.dataset.suppressClick='0';
        return;
      }
      if(typeof openBaithakStoryComposer==='function') openBaithakStoryComposer('camera');
      else showAddStoryOptions();
    });
    if(addStoryBtn&&typeof onLongPress==='function'){
      onLongPress(addStoryBtn,()=>{
        addStoryBtn.dataset.suppressClick='1';
        if(typeof showBaithakShareMenu==='function') showBaithakShareMenu();
      });
    }
    document.getElementById('baithakSearch')?.addEventListener('input',e=>{
      const q=e.target.value.toLowerCase();
      // @prefix ? people search (Phase 4 universal search)
      if(q.startsWith('@')&&q.length>1&&typeof openUniversalSearch==='function'){
        openUniversalSearch({initialQuery:q.slice(1),types:['users']});
        e.target.value='';
        return;
      }
      renderChatList(typeof getBaithakChatsForSearch==='function'?getBaithakChatsForSearch(q):(SAMPLE_CHATS.filter(c=>c.name.toLowerCase().includes(q))));
    });
  }
  if(currentUser&&typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
  else renderStories();
  // Always paint inbox (Message Yourself is pinned inside renderChatList / pinSelfChat).
  // Do NOT replace the list with a full-page skeleton ? that was wiping the self-chat row
  // when Firestore hydration was slow or hung.
  if(typeof baithakChats!=='undefined') baithakChats = typeof pinSelfChat==='function' ? pinSelfChat(baithakChats) : baithakChats;
  renderChatList(typeof baithakChats!=='undefined'?baithakChats:SAMPLE_CHATS);
  if(db&&currentUser&&typeof loadBaithakChatsPage==='function'){
    loadBaithakChatsPage({reset:true})
      .then(()=>{ if(typeof baithakChats!=='undefined') baithakChats = pinSelfChat(baithakChats); renderChatList(baithakChats); })
      .catch(()=>renderChatList(typeof baithakChats!=='undefined'?pinSelfChat(baithakChats):SAMPLE_CHATS));
  }
}

// FUTURE_I18N: Baithak UI strings below are English defaults until a language preference exists.
// ===================== CUSTOM CHALLENGE CREATOR =====================
function openChallengeCreator(chat){
  const creator = document.createElement('div');
  creator.className = 'challenge-creator';
  let qCount = 3;
  let questions = [createBlankQuestion()];
  let timerSeconds = (typeof MUQABALA_DEFAULT_TIMER === 'number') ? MUQABALA_DEFAULT_TIMER : 20;
  const timerOpts = (typeof MUQABALA_TIMER_OPTIONS !== 'undefined') ? MUQABALA_TIMER_OPTIONS : [10, 15, 20, 30];
  let contentSource = 'manual'; // 'manual' | 'ai'
  let aiBusy = false;
  let fromAi = false;

  const aiEnabledSync = typeof isAiFeaturesEnabledSync === 'function' ? isAiFeaturesEnabledSync() : false;

  function createBlankQuestion(){return{text:'',format:'mcq',options:['','','',''],correct:0};}

  function syncFromDom(){
    creator.querySelectorAll('.challenge-q-card').forEach((card, i)=>{
      if(!questions[i]) return;
      const ta = card.querySelector('.challenge-q-input');
      if(ta) questions[i].text = ta.value;
      const opts = card.querySelectorAll('.challenge-opt-input');
      if(opts.length){
        questions[i].options = Array.from(opts).map(inp=>inp.value);
      }
      const checked = card.querySelector(`input[name="correct_${i}"]:checked`);
      if(checked){
        const radios = card.querySelectorAll(`input[name="correct_${i}"]`);
        questions[i].correct = Array.from(radios).indexOf(checked);
      }
    });
  }

  function toEngineQuestions(list){
    return list.map(q=>{
      let options = (q.options || []).map(x=>String(x||'').trim()).filter(Boolean);
      if(q.format === 'binary') options = ['Yes', 'No'];
      while(options.length < 2) options.push('Option ' + (options.length + 1));
      let correct = parseInt(q.correct, 10);
      if(Number.isNaN(correct) || correct < 0 || correct >= options.length) correct = 0;
      return { q: String(q.text || '').trim(), options: options.slice(0, 4), correct };
    }).filter(q=>q.q);
  }

  function postChallengeBubble(engineQs, source){
    const challengeId = 'mc_' + Date.now();
    window.__pendingMuqabalaChallenges = window.__pendingMuqabalaChallenges || {};
    window.__pendingMuqabalaChallenges[challengeId] = {
      questions: engineQs,
      timerSeconds,
      opponent: chat.name,
      mode: source === 'ai' ? 'AI' : 'Custom',
      source: source === 'ai' ? 'ai' : 'manual',
    };
    const area = document.getElementById('chatMsgsArea');
    if(area){
      const div = document.createElement('div');
      div.innerHTML = `<div class="msg-row me"><div><div class="msg-bubble challenge"><div class="challenge-label">⚔️ Custom Challenge</div><div class="challenge-title">${engineQs.length} questions · ${timerSeconds}s · for ${chat.name}</div><button class="challenge-btn" type="button" data-muqabala-challenge="${challengeId}">Answer →</button></div></div></div>`;
      const row = div.firstElementChild;
      area.appendChild(row);
      area.scrollTop = area.scrollHeight;
      row.querySelector('[data-muqabala-challenge]')?.addEventListener('click', ()=>{
        if(typeof launchPendingMuqabalaChallenge === 'function') launchPendingMuqabalaChallenge(challengeId);
        else if(typeof startMuqabala === 'function'){
          startMuqabala(chat.name, source === 'ai' ? 'AI' : 'Custom', {
            questions: engineQs,
            timerSeconds,
            source: source === 'ai' ? 'ai' : 'manual',
            skipMatchmaking: true,
          });
        }
      });
    }
    return challengeId;
  }

  function launchEngine(engineQs, source){
    if(typeof startMuqabala !== 'function'){
      showToast('Muqabala engine not ready');
      return;
    }
    startMuqabala(chat.name, source === 'ai' ? 'AI' : 'Custom', {
      questions: engineQs,
      timerSeconds,
      source: source === 'ai' ? 'ai' : 'manual',
      skipMatchmaking: true,
    });
  }

  function closeCreator(){
    creator.classList.remove('open');
    setTimeout(()=>creator.remove(), 350);
  }

  function render(){
    const aiComingSoon = !aiEnabledSync;
    creator.innerHTML = `
      <div class="challenge-creator-header">
        <div class="challenge-creator-title">⚔️ Create challenge</div>
        <button id="closeCreator" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div class="challenge-creator-body">
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Content source</div>
        <div class="q-count-row" style="margin-bottom:14px;">
          <button class="q-count-chip ${contentSource==='manual'?'active':''}" data-src="manual" type="button">✍️ Manual</button>
          <button class="q-count-chip ${contentSource==='ai'?'active':''}" data-src="ai" type="button" ${aiComingSoon?'title="Coming soon"':''}>🤖 AI ${aiComingSoon?'(coming soon)':''}</button>
        </div>

        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Timer per question</div>
        <div class="q-count-row" style="margin-bottom:14px;">
          ${timerOpts.map(s=>`<button class="q-count-chip ${timerSeconds===s?'active':''}" data-timer="${s}" type="button">${s}s</button>`).join('')}
        </div>

        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">How many questions?</div>
        <div class="q-count-row">
          ${[3,5,'Custom'].map(n=>`<button class="q-count-chip ${qCount===n?'active':''}" data-n="${n}" type="button">${n}</button>`).join('')}
        </div>

        ${contentSource==='ai' ? `
          <div style="margin:14px 0;padding:12px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.45;">
            ${aiComingSoon
              ? 'AI quiz generation is coming soon. Switch to Manual to write your own questions.'
              : (aiBusy ? '🤖 Generating questions…' : 'Generate MCQs with AI, then send — same Muqabala engine as Dangal.')}
          </div>
          ${!aiComingSoon ? `<button class="add-q-btn" id="aiGenBtn" type="button" ${aiBusy?'disabled':''}>🤖 Generate with AI</button>` : ''}
        ` : `
          <div id="questionsContainer">
            ${questions.map((q,i) => renderQuestionBuilder(q,i)).join('')}
          </div>
          <button class="add-q-btn" id="addQBtn" type="button">+ Add another question</button>
        `}

        <button class="btn btn--primary btn--block btn--lg send-challenge-btn" id="sendChallengeBtn" type="button">⚔️ Send & play vs ${chat.name}</button>
      </div>
    `;

    creator.querySelectorAll('[data-src]').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const src = chip.dataset.src;
        if(src === 'ai' && aiComingSoon){
          showToast('AI quiz generation coming soon');
          return;
        }
        syncFromDom();
        contentSource = src;
        render();
      });
    });

    creator.querySelectorAll('[data-timer]').forEach(chip=>{
      chip.addEventListener('click',()=>{
        syncFromDom();
        timerSeconds = parseInt(chip.dataset.timer, 10) || 20;
        render();
      });
    });

    creator.querySelectorAll('.q-count-chip[data-n]').forEach(chip=>{
      chip.addEventListener('click',async ()=>{
        syncFromDom();
        const n = chip.dataset.n;
        if(n === 'Custom'){
          const raw =
            typeof promptNameSheet === 'function'
              ? await promptNameSheet({
                  title: 'How many questions?',
                  placeholder: '1–20',
                  confirmLabel: 'Set',
                  initial: String(qCount || 5),
                  inputMode: 'numeric',
                  maxlength: 2,
                })
              : null;
          const c = parseInt(raw, 10);
          if(c && c > 0 && c <= 20) qCount = c;
        } else qCount = parseInt(n, 10);
        while(questions.length < qCount) questions.push(createBlankQuestion());
        if(questions.length > qCount) questions = questions.slice(0, qCount);
        render();
      });
    });

    document.getElementById('closeCreator')?.addEventListener('click', closeCreator);
    document.getElementById('addQBtn')?.addEventListener('click',()=>{
      syncFromDom();
      questions.push(createBlankQuestion());
      qCount = questions.length;
      render();
    });

    document.getElementById('aiGenBtn')?.addEventListener('click', async ()=>{
      if(aiBusy) return;
      const on = typeof isAiFeaturesEnabled === 'function' ? await isAiFeaturesEnabled() : aiEnabledSync;
      if(!on){
        showToast('AI quiz generation coming soon');
        return;
      }
      aiBusy = true;
      render();
      const gen = typeof generateMuqabalaQuestionsAI === 'function'
        ? await generateMuqabalaQuestionsAI({ category: 'GK', count: typeof qCount === 'number' ? qCount : 5 })
        : null;
      aiBusy = false;
      if(!gen || !gen.length){
        showToast('Could not generate questions — try Manual');
        contentSource = 'manual';
        render();
        return;
      }
      questions = gen.map(g=>({
        text: g.q,
        format: 'mcq',
        options: (g.options || []).concat(['','','','']).slice(0, 4),
        correct: g.correct != null ? g.correct : 0,
      }));
      qCount = questions.length;
      fromAi = true;
      contentSource = 'manual'; // show editable results
      showToast(`Generated ${questions.length} questions — review & send`);
      render();
    });

    document.getElementById('sendChallengeBtn')?.addEventListener('click',()=>{
      syncFromDom();
      const engineQs = toEngineQuestions(questions);
      if(!engineQs.length){
        showToast('Add at least one question with text');
        return;
      }
      const incomplete = engineQs.some(q=>q.options.length < 2);
      if(incomplete){
        showToast('Each question needs at least 2 options');
        return;
      }
      const source = fromAi ? 'ai' : 'manual';
      // Friend challenges are unlimited — no daily credit.
      postChallengeBubble(engineQs, source);
      closeCreator();
      showToast(`Challenge sent to ${chat.name}!`);
      launchEngine(engineQs, source);
    });

    creator.querySelectorAll('.format-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        syncFromDom();
        const qi = parseInt(chip.dataset.qi, 10);
        const fmt = chip.dataset.fmt;
        if(questions[qi]){
          questions[qi].format = fmt;
          if(fmt === 'binary') questions[qi].options = ['Yes', 'No'];
        }
        render();
        setTimeout(()=>{
          const body = creator.querySelector('.challenge-creator-body');
          if(body) body.scrollTop = chip.offsetTop - 100;
        }, 50);
      });
    });
  }

  function renderQuestionBuilder(q, i){
    const optHtml = {
      mcq: `${['A','B','C','D'].map((l,oi)=>`<div style="display:flex;align-items:center;gap:6px;"><input class="challenge-opt-input" placeholder="${l}..." value="${(q.options[oi]||'').replace(/"/g,'&quot;')}"><label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="radio" name="correct_${i}" ${q.correct===oi?'checked':''} style="accent-color:var(--red);"> Correct</label></div>`).join('')}`,
      binary: `${['Yes','No'].map((l,oi)=>`<div style="display:flex;align-items:center;gap:6px;"><input class="challenge-opt-input" value="${l}" readonly><label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="radio" name="correct_${i}" ${q.correct===oi?'checked':''} style="accent-color:var(--red);"> Correct</label></div>`).join('')}`,
      dropdown: `${['Option A','Option B','Option C'].map((l,oi)=>`<input class="challenge-opt-input" placeholder="${l}" value="${(q.options[oi]||'').replace(/"/g,'&quot;')}">`).join('')}`,
    }[q.format] || '';
    return `
      <div class="challenge-q-card">
        <div class="challenge-q-num">Question ${i+1}</div>
        <textarea class="challenge-q-input" placeholder="Write your question..." rows="2" data-qi="${i}">${q.text||''}</textarea>
        <div class="format-row">
          ${[{k:'mcq',l:'MCQ'},{k:'binary',l:'Yes/No'},{k:'dropdown',l:'Dropdown'}].map(f=>`<button class="format-chip ${q.format===f.k?'active':''}" data-qi="${i}" data-fmt="${f.k}" type="button">${f.l}</button>`).join('')}
        </div>
        <div class="challenge-options-area">${optHtml}</div>
      </div>
    `;
  }

  document.querySelector('.device').appendChild(creator);
  requestAnimationFrame(()=>creator.classList.add('open'));
  render();
}

function showNewChatOptions(){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
  // FUTURE_I18N: new-chat sheet copy
  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:14px;">New chat</div>
    <button id="newDm" style="width:100%;padding:14px;background:var(--cream);border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;text-align:left;margin-bottom:8px;">💬 New DM</button>
    <button id="newGroup" style="width:100%;padding:14px;background:var(--cream);border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;text-align:left;margin-bottom:8px;">👥 Create group</button>
    <button id="closeSheet2" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('newDm').addEventListener('click',()=>{sheet.remove();showToast("Enter a friend's username");});
  document.getElementById('newGroup').addEventListener('click',()=>{sheet.remove();showCreateGroup();});
  document.getElementById('closeSheet2').addEventListener('click',()=>sheet.remove());
}

function showCreateGroup(){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;padding:24px;';
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
      <button id="closeGrp" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">New group</div>
    </div>
    <input class="auth-input" placeholder="Group name" id="grpName">
    <input class="auth-input" placeholder="Description (optional)" id="grpDesc">
    <div style="font-size:13px;font-weight:600;color:var(--muted);margin:8px 0;">Share the group link so others can join →</div>
    <div style="background:var(--white);border-radius:12px;padding:14px;font-size:13px;color:var(--red);font-weight:600;">chaupaal.app/join/abc123 <span style="color:var(--muted);font-weight:400;">(auto-generated)</span></div>
    <button style="margin-top:auto;width:100%;padding:15px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;" id="createGrpBtn">Create group</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closeGrp').addEventListener('click',()=>sheet.remove());
  document.getElementById('createGrpBtn').addEventListener('click',()=>{
    const name=document.getElementById('grpName').value.trim();
    if(!name){showToast('Enter a group name');return;}
    sheet.remove();showToast(`"${name}" group created`);
  });
}

// ===================== MONTHLY/YEARLY WRAP =====================
// Monthly wrap lives in streak.js (buildWrapData + showMonthlyWrap). Do not redefine here.
function showYearlyWrap(){
  const now=new Date();
  const isUnlocked=(now.getMonth()===11&&now.getDate()>=25)||now.getMonth()===0;
  if(!isUnlocked){showToast('Yearly Wrap unlocks on December 25th for everyone');return;}
  const d=buildWrapData();
  const year=now.getFullYear()-(now.getMonth()===0?1:0);
  const totalSessions=JSON.parse(localStorage.getItem('chaupaal_play_history')||'[]').length;
  const wrap=document.createElement('div');wrap.className='wrap-overlay';
  const pages=[
    {bg:'linear-gradient(160deg,#0F0C29,#302B63,#24243e)',content:`<div style="font-size:56px;margin-bottom:16px;">✨</div><div class="wrap-label" style="color:rgba(255,255,255,0.6);">${year} on Chaupaal</div><div class="wrap-headline" style="color:#fff;">Your year in review</div><div class="wrap-sub" style="color:rgba(255,255,255,0.6);">Tap to explore →</div>`},
    {bg:'linear-gradient(160deg,#E63946,#C72E3A)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">You showed up</div><div class="wrap-big-num" style="color:#fff;">${totalSessions}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">days you played Akhbaar this year</div>`},
    {bg:'linear-gradient(160deg,var(--navy),#2A3158)',content:`<div class="wrap-label" style="color:var(--gold);">Your biggest obsession</div><div style="font-size:64px;margin:8px 0;">${CATEGORY_ICONS[d.topCat]||'🏆'}</div><div class="wrap-headline" style="color:#fff;">${d.topCat}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">You dominated this all year</div>`},
    {bg:'linear-gradient(160deg,#2A9D8F,#1A6B64)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Accuracy</div><div class="wrap-big-num" style="color:#fff;">${d.accuracy}%</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${d.totalCorrect} correct out of ${d.totalQ}</div>`},
    {bg:'linear-gradient(160deg,#FF9A3C,#E63946)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Longest streak</div><div class="wrap-big-num" style="color:#fff;">🔥 ${d.streak}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">consecutive days this year</div>`},
    {bg:'linear-gradient(160deg,#8134AF,#515BD4)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Your personality</div><div style="font-size:48px;margin:12px 0;">${personalityProfile.lifestyle==='outdoorsy'?'🌿':personalityProfile.lifestyle==='intellectual'?'📚':personalityProfile.lifestyle==='cinephile'?'🎬':'🧭'}</div><div class="wrap-headline" style="color:#fff;font-size:28px;">${personalityProfile.lifestyle?personalityProfile.lifestyle.charAt(0).toUpperCase()+personalityProfile.lifestyle.slice(1):'Curious Explorer'}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">From your Aur Sunao answers & daily reflections</div>`},
    {bg:'linear-gradient(160deg,#C9A227,#B7791F)',content:`<div style="font-size:56px;margin-bottom:16px;">🥂</div><div class="wrap-headline" style="color:#fff;">Here's to ${year+1}!</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">Keep reading, keep playing. The Chaupaal is always open.</div><button class="wrap-share-btn" id="wrapYearShare">Share your ${year} Wrap</button>`},
  ];
  let idx=0;
  function renderPage(){
    const p=pages[idx];
    wrap.innerHTML=`<div class="wrap-page" style="background:${p.bg};">${p.content}<button class="wrap-close" onclick="this.closest('.wrap-overlay').remove()">✕</button></div>`;
    wrap.querySelector('#wrapYearShare')?.addEventListener('click',()=>{
      const wrapStats=typeof buildShareStats==='function'
        ? buildShareStats({
            scoreLine:`${d.accuracy}%`,
            meta:`${totalSessions} days · ${d.streak}-day streak · ${d.topCat}`,
            text:`My ${year} Chaupaal Wrap\n${totalSessions} days · ${d.accuracy}% accuracy · ${d.streak}-day streak · ${d.topCat}`,
          })
        : {scoreLine:`${d.accuracy}%`,meta:`${year}`,text:`My ${year} Chaupaal Wrap`};
      if(typeof openUnifiedShareSheet==='function'){
        openUnifiedShareSheet({gameId:'wrap',title:`Share ${year} Wrap`,subtitle:'Your year on Chaupaal',stats:wrapStats});
      } else {
        const text=`My ${year} Chaupaal Wrap\n${totalSessions} days · ${d.accuracy}% accuracy · ${d.streak}-day streak · ${d.topCat}\nchaupaal-chaupaal.web.app`;
        if(navigator.share)navigator.share({text});else{navigator.clipboard.writeText(text);showToast('Copied!');}
      }
    });
    wrap.querySelector('.wrap-page').addEventListener('click',e=>{if(e.target.closest('button'))return;idx++;if(idx>=pages.length)wrap.remove();else renderPage();});
  }
  document.querySelector('.device').appendChild(wrap);renderPage();
}

// ===================== HOW WAS YOUR DAY (10 PM) =====================
const dayCheckModal=document.createElement('div');dayCheckModal.className='day-check-modal';
dayCheckModal.innerHTML=`
  <div class="day-check-title">How was your day?</div>
  <div class="day-check-sub">Write what's on your mind — saved privately to your Archive, only you can see it</div>
  <textarea class="day-check-textarea" id="dayCheckText" placeholder="Anything interesting happen today? Something on your mind? Just write..."></textarea>
  <button class="btn btn--primary btn--block day-check-send" id="dayCheckSend">Save to Journal</button>
  <button class="day-check-skip" id="dayCheckSkip">Not today, maybe tomorrow</button>
`;
document.querySelector('.device').appendChild(dayCheckModal);

function showDayCheck(){
  dayCheckModal.classList.add('open');
  if(!localStorage.getItem('chaupaal_journal_intro_seen')){
    setTimeout(()=>showToast('Journal entries stay private in your Archive — only you can see them'),400);
    localStorage.setItem('chaupaal_journal_intro_seen','1');
  }
  setTimeout(()=>{
    const ta=dayCheckModal.querySelector('#dayCheckText');
    if(ta) wireAiKbToInput(ta,'User daily journal reflection');
  },100);
}
window.showDayCheck = showDayCheck;

// Schedule 10 PM check-in (demo: show after 10s if it's past 10 PM)
function scheduleEveningCheckIn(){
  const now=new Date();const hour=now.getHours();
  if(hour>=22||hour<1){setTimeout(showDayCheck,10000);}
}
