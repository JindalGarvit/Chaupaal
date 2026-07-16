// ===================== BAITHAK INIT =====================
function initBaithak(){
  const storiesRow=document.getElementById('storiesRow');
  if(!storiesRow)return;
  if(!storiesRow.dataset.wired){
    storiesRow.dataset.wired='1';
    document.getElementById('baithakFab')?.addEventListener('click',showNewChatOptions);
    document.getElementById('newChatBtn')?.addEventListener('click',showNewChatOptions);
    document.getElementById('addStoryBtn')?.addEventListener('click',showAddStoryOptions);
    document.getElementById('baithakSearch')?.addEventListener('input',e=>{
      const q=e.target.value.toLowerCase();
      // @prefix → people search (Phase 4 universal search)
      if(q.startsWith('@')&&q.length>1&&typeof openUniversalSearch==='function'){
        openUniversalSearch({initialQuery:q.slice(1),types:['users']});
        e.target.value='';
        return;
      }
      renderChatList(typeof getBaithakChatsForSearch==='function'?getBaithakChatsForSearch(q):(SAMPLE_CHATS.filter(c=>c.name.toLowerCase().includes(q))));
    });
  }
  renderStories();
  // Show samples immediately, then hydrate from Firestore with cursor pages.
  renderChatList(typeof baithakChats!=='undefined'?baithakChats:SAMPLE_CHATS);
  if(db&&currentUser&&typeof loadBaithakChatsPage==='function'){
    const list=document.getElementById('chatList');
    if(typeof renderSkeleton==='function'&&list&&!baithakChatLiveMode) renderSkeleton(list,{variant:'list',count:3});
    loadBaithakChatsPage({reset:true}).then(()=>renderChatList(baithakChats));
  }
}

// ===================== CUSTOM CHALLENGE CREATOR =====================
function openChallengeCreator(chat){
  const creator = document.createElement('div');
  creator.className = 'challenge-creator';
  let qCount = 3;
  let questions = [createBlankQuestion()];

  function render(){
    creator.innerHTML = `
      <div class="challenge-creator-header">
        <div class="challenge-creator-title">🎯 Challenge banao</div>
        <button id="closeCreator" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div class="challenge-creator-body">
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Kitne sawaal?</div>
        <div class="q-count-row">
          ${[3,5,'Custom'].map(n=>`<button class="q-count-chip ${qCount===n?'active':''}" data-n="${n}">${n}</button>`).join('')}
        </div>
        <div id="questionsContainer">
          ${questions.map((q,i) => renderQuestionBuilder(q,i)).join('')}
        </div>
        <button class="add-q-btn" id="addQBtn">＋ Aur sawaal jodein</button>
        <button class="send-challenge-btn" id="sendChallengeBtn">📤 ${chat.name} ko bhejo</button>
      </div>
    `;

    creator.querySelectorAll('.q-count-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const n=chip.dataset.n;
        if(n==='Custom'){const c=parseInt(prompt('Kitne sawaal? (1-20)','5'));if(c&&c>0&&c<=20)qCount=c;}
        else qCount=parseInt(n);
        render();
      });
    });

    document.getElementById('closeCreator').addEventListener('click',()=>{creator.classList.remove('open');setTimeout(()=>creator.remove(),350);});
    document.getElementById('addQBtn').addEventListener('click',()=>{questions.push(createBlankQuestion());render();});
    document.getElementById('sendChallengeBtn').addEventListener('click',()=>{
      creator.classList.remove('open');
      setTimeout(()=>creator.remove(),350);
      showToast(`Challenge ${chat.name} ko bheja gaya! ✅`);
      // Add challenge bubble to chat
      const area = document.getElementById('chatMsgsArea');
      if(area){
        const div=document.createElement('div');
        div.innerHTML=`<div class="msg-row me"><div><div class="msg-bubble challenge"><div class="challenge-label">🎯 Custom Challenge</div><div class="challenge-title">${questions.length} sawaal · ${chat.name} ke liye</div><button class="challenge-btn" onclick="showToast('Challenge answer karo!')">Jawab do ↗</button></div></div></div>`;
        area.appendChild(div.firstElementChild);area.scrollTop=area.scrollHeight;
      }
    });

    // format chips
    creator.querySelectorAll('.format-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const qi=parseInt(chip.dataset.qi),fmt=chip.dataset.fmt;
        questions[qi].format=fmt;render();
        setTimeout(()=>{creator.querySelector('.challenge-creator-body').scrollTop=chip.offsetTop-100;},50);
      });
    });
  }

  function createBlankQuestion(){return{text:'',format:'mcq',options:['','','',''],correct:0};}

  function renderQuestionBuilder(q,i){
    const optHtml={
      mcq:`${['A','B','C','D'].map((l,oi)=>`<div style="display:flex;align-items:center;gap:6px;"><input class="challenge-opt-input" placeholder="${l}..." value="${q.options[oi]||''}"><label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="radio" name="correct_${i}" ${q.correct===oi?'checked':''} style="accent-color:var(--red);"> Sahi</label></div>`).join('')}`,
      binary:`${['Haan','Nahi'].map((l,oi)=>`<div style="display:flex;align-items:center;gap:6px;"><input class="challenge-opt-input" value="${l}" readonly><label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="radio" name="correct_${i}" ${q.correct===oi?'checked':''} style="accent-color:var(--red);"> Sahi</label></div>`).join('')}`,
      dropdown:`${['Option A','Option B','Option C'].map((l,oi)=>`<input class="challenge-opt-input" placeholder="${l}" value="${q.options[oi]||''}">`).join('')}`,
    }[q.format]||'';
    return `
      <div class="challenge-q-card">
        <div class="challenge-q-num">Sawaal ${i+1}</div>
        <textarea class="challenge-q-input" placeholder="Sawaal likhein..." rows="2" data-qi="${i}">${q.text}</textarea>
        <div class="format-row">
          ${[{k:'mcq',l:'MCQ'},{k:'binary',l:'Haan/Nahi'},{k:'dropdown',l:'Dropdown'}].map(f=>`<button class="format-chip ${q.format===f.k?'active':''}" data-qi="${i}" data-fmt="${f.k}">${f.l}</button>`).join('')}
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
  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:14px;">Nayi baithak</div>
    <button id="newDm" style="width:100%;padding:14px;background:var(--cream);border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;text-align:left;margin-bottom:8px;">💬 Naya DM</button>
    <button id="newGroup" style="width:100%;padding:14px;background:var(--cream);border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;text-align:left;margin-bottom:8px;">👥 Naya Group banao</button>
    <button id="closeSheet2" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('newDm').addEventListener('click',()=>{sheet.remove();showToast('Dost ka username enter karo');});
  document.getElementById('newGroup').addEventListener('click',()=>{sheet.remove();showCreateGroup();});
  document.getElementById('closeSheet2').addEventListener('click',()=>sheet.remove());
}

function showCreateGroup(){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;padding:24px;';
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
      <button id="closeGrp" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">Naya Group</div>
    </div>
    <input class="auth-input" placeholder="Group ka naam" id="grpName">
    <input class="auth-input" placeholder="Description (optional)" id="grpDesc">
    <div style="font-size:13px;font-weight:600;color:var(--muted);margin:8px 0;">Group link share karke join karne do 🔗</div>
    <div style="background:var(--white);border-radius:12px;padding:14px;font-size:13px;color:var(--red);font-weight:600;">chaupaal.app/join/abc123 <span style="color:var(--muted);font-weight:400;">(auto-generated)</span></div>
    <button style="margin-top:auto;width:100%;padding:15px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;" id="createGrpBtn">Group banao ✓</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closeGrp').addEventListener('click',()=>sheet.remove());
  document.getElementById('createGrpBtn').addEventListener('click',()=>{
    const name=document.getElementById('grpName').value.trim();
    if(!name){showToast('Group ka naam daalo');return;}
    sheet.remove();showToast(`"${name}" group ban gaya! 🎉`);
  });
}

// ===================== MONTHLY/YEARLY WRAP =====================
function showMonthlyWrap(){
  const wrap=document.createElement('div');wrap.className='wrap-overlay';
  const now=new Date();const monthName=now.toLocaleString('en-IN',{month:'long'});
  const pages=[
    {bg:'linear-gradient(160deg,#E63946,#C72E3A)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">${monthName} ka wrap</div><div class="wrap-headline" style="color:#fff;">Is mahine aapne kitna seekha? 🎓</div><div style="color:rgba(255,255,255,0.7);font-size:14px;">Scroll karo apni journey dekhne ke liye ↓</div>`},
    {bg:'linear-gradient(160deg,var(--navy),#2A3158)',content:`<div class="wrap-label" style="color:var(--gold);">Questions answered</div><div class="wrap-big-num" style="color:#fff;">${Math.floor(Math.random()*200+100)}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">sawaalon ke jawab diye aapne</div>`},
    {bg:'linear-gradient(160deg,#5FBA7D,#2E8B57)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Top Category</div><div class="wrap-headline" style="color:#fff;font-size:40px;">🏏 Sports</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">Sabse zyada aapne Sports mein hath azmaaya</div>`},
    {bg:'linear-gradient(160deg,#FF9A3C,#FF6B35)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Longest Streak</div><div class="wrap-big-num" style="color:#fff;">🔥 24</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">din lagatar Akhbaar padha</div>`},
    {bg:'linear-gradient(160deg,#8134AF,#515BD4)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Muqabala Record</div><div class="wrap-headline" style="color:#fff;">7W — 3L</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">Dangal mein aap kaafi aage hain! ⚔️</div><button class="wrap-share-btn" id="wrapShareBtn">📤 Share karo</button>`},
  ];
  let pageIdx=0;
  function renderPage(){
    const p=pages[pageIdx];
    wrap.innerHTML=`<div class="wrap-page" style="background:${p.bg};">${p.content}<button class="wrap-close" onclick="this.closest('.wrap-overlay').remove()">✕</button></div>`;
    const shareBtn=wrap.querySelector('#wrapShareBtn');
    if(shareBtn)shareBtn.addEventListener('click',()=>{if(navigator.share)navigator.share({text:`Mere ${monthName} Chaupaal Wrap: 7W-3L Dangal, 24-day streak! 🔥 chaupaal-chaupaal.web.app`});else showToast('Wrap copied!');});
    wrap.querySelector('.wrap-page').addEventListener('click',e=>{
      if(e.target.closest('button'))return;
      pageIdx++;if(pageIdx>=pages.length){wrap.remove();}else renderPage();
    });
  }
  document.querySelector('.device').appendChild(wrap);renderPage();
}

function showYearlyWrap(){
  const now=new Date();
  const isUnlocked=(now.getMonth()===11&&now.getDate()>=25)||now.getMonth()===0;
  if(!isUnlocked){showToast('🎄 Yearly Wrap unlocks on December 25th for everyone!');return;}
  const d=buildWrapData();
  const year=now.getFullYear()-(now.getMonth()===0?1:0);
  const totalSessions=JSON.parse(localStorage.getItem('chaupaal_play_history')||'[]').length;
  const wrap=document.createElement('div');wrap.className='wrap-overlay';
  const pages=[
    {bg:'linear-gradient(160deg,#0F0C29,#302B63,#24243e)',content:`<div style="font-size:56px;margin-bottom:16px;">🎊</div><div class="wrap-label" style="color:rgba(255,255,255,0.6);">${year} on Chaupaal</div><div class="wrap-headline" style="color:#fff;">Your year in review</div><div class="wrap-sub" style="color:rgba(255,255,255,0.6);">Tap to explore ↓</div>`},
    {bg:'linear-gradient(160deg,#E63946,#C72E3A)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">You showed up</div><div class="wrap-big-num" style="color:#fff;">${totalSessions}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">days you played Akhbaar this year 🏆</div>`},
    {bg:'linear-gradient(160deg,var(--navy),#2A3158)',content:`<div class="wrap-label" style="color:var(--gold);">Your biggest obsession</div><div style="font-size:64px;margin:8px 0;">${CATEGORY_ICONS[d.topCat]||'🎯'}</div><div class="wrap-headline" style="color:#fff;">${d.topCat}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">You dominated this all year</div>`},
    {bg:'linear-gradient(160deg,#2A9D8F,#1A6B64)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Accuracy</div><div class="wrap-big-num" style="color:#fff;">${d.accuracy}%</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${d.totalCorrect} correct out of ${d.totalQ}</div>`},
    {bg:'linear-gradient(160deg,#FF9A3C,#E63946)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Longest streak</div><div class="wrap-big-num" style="color:#fff;">🔥 ${d.streak}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">consecutive days this year</div>`},
    {bg:'linear-gradient(160deg,#8134AF,#515BD4)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">Your personality</div><div style="font-size:48px;margin:12px 0;">${personalityProfile.lifestyle==='outdoorsy'?'🏔️':personalityProfile.lifestyle==='intellectual'?'📚':personalityProfile.lifestyle==='cinephile'?'🎬':'🌟'}</div><div class="wrap-headline" style="color:#fff;font-size:28px;">${personalityProfile.lifestyle?personalityProfile.lifestyle.charAt(0).toUpperCase()+personalityProfile.lifestyle.slice(1):'Curious Explorer'}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">From your Aur Sunao answers & daily reflections</div>`},
    {bg:'linear-gradient(160deg,#C9A227,#B7791F)',content:`<div style="font-size:56px;margin-bottom:16px;">🏅</div><div class="wrap-headline" style="color:#fff;">Here's to ${year+1}!</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">Keep reading, keep playing. The Chaupaal is always open. 🪑</div><button class="wrap-share-btn" id="wrapYearShare">📤 Share your ${year} Wrap</button>`},
  ];
  let idx=0;
  function renderPage(){
    const p=pages[idx];
    wrap.innerHTML=`<div class="wrap-page" style="background:${p.bg};">${p.content}<button class="wrap-close" onclick="this.closest('.wrap-overlay').remove()">✕</button></div>`;
    wrap.querySelector('#wrapYearShare')?.addEventListener('click',()=>{
      const text=`My ${year} Chaupaal Wrap 🎊\n📅 ${totalSessions} days · 🎯 ${d.accuracy}% accuracy · 🔥 ${d.streak}-day streak · ⭐ ${d.topCat}\nchaupaal-chaupaal.web.app`;
      if(navigator.share)navigator.share({text});else{navigator.clipboard.writeText(text);showToast('Copied!');}
    });
    wrap.querySelector('.wrap-page').addEventListener('click',e=>{if(e.target.closest('button'))return;idx++;if(idx>=pages.length)wrap.remove();else renderPage();});
  }
  document.querySelector('.device').appendChild(wrap);renderPage();
}

// ===================== HOW WAS YOUR DAY (10 PM) =====================
const dayCheckModal=document.createElement('div');dayCheckModal.className='day-check-modal';
dayCheckModal.innerHTML=`
  <div class="day-check-title">How was your day? 🌙</div>
  <div class="day-check-sub">Write what's on your mind — saved privately to your Archive, only you can see it</div>
  <textarea class="day-check-textarea" id="dayCheckText" placeholder="Anything interesting happen today? Something on your mind? Just write..."></textarea>
  <button class="day-check-send" id="dayCheckSend">Save to Journal 🙏</button>
  <button class="day-check-skip" id="dayCheckSkip">Not today, maybe tomorrow</button>
`;
document.querySelector('.device').appendChild(dayCheckModal);

function showDayCheck(){
  dayCheckModal.classList.add('open');
  if(!localStorage.getItem('chaupaal_journal_intro_seen')){
    setTimeout(()=>showToast('💡 Your journal entries are saved privately in your Archive — only you can see them'),400);
    localStorage.setItem('chaupaal_journal_intro_seen','1');
  }
  setTimeout(()=>{
    const ta=dayCheckModal.querySelector('#dayCheckText');
    if(ta) wireAiKbToInput(ta,'User daily journal reflection');
  },100);
}

// Schedule 10 PM check-in (demo: show after 10s if it's past 10 PM)
function scheduleEveningCheckIn(){
  const now=new Date();const hour=now.getHours();
  if(hour>=22||hour<1){setTimeout(showDayCheck,10000);}
}
