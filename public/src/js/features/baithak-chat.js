// ===================== CHAT SCREEN =====================
let activeChatScreen = null;

function openChatScreen(chat){
  const existing = document.getElementById('activeChatScreen');
  if(existing) existing.remove();

  const screen = document.createElement('div');
  screen.id = 'activeChatScreen';
  screen.className = 'chat-screen';
  const msgs = SAMPLE_MESSAGES[chat.id] || [];
  const isGroup = chat.type === 'group';
  const hasDuelStreak = !isGroup && chat.duelStreak;

  screen.innerHTML = `
    <div class="chat-screen-header">
      <button class="chat-back" id="chatBack">←</button>
      <div class="chat-header-avatar">${chat.avatar}</div>
      <div>
        <div class="chat-header-name">${chat.name}</div>
        <div id="chatActivityStatus" style="font-size:11px;color:var(--muted);">Checking activity…</div>
      </div>
      <div class="chat-header-actions">
        <button class="chat-header-btn" id="chatChallengeBtn" title="Create challenge">🎯</button>
        ${!isGroup?`<button class="chat-header-btn" id="chatMuqabalaBtn" title="Muqabala">⚔️</button>`:''}
      </div>
    </div>
    ${hasDuelStreak?`
    <div class="duel-ritual-bar" id="duelRitualBar">
      <div>
        <div class="duel-ritual-info">Daily Duel Ritual 🔥</div>
        <div class="duel-ritual-streak">${chat.duelStreak} day streak with ${chat.name}</div>
      </div>
      <button class="duel-ritual-cta" id="startRitualBtn">Play today!</button>
    </div>`:''}
    <div class="chat-messages-area" id="chatMsgsArea">
      ${msgs.map(m => renderMsgBubble(m, isGroup)).join('')}
    </div>
    <div class="ai-suggestion-bar hidden" id="aiSuggestionBar"></div>
    <div class="chat-attach-menu" id="chatAttachMenu">
      <div class="chat-attach-option" id="attachPhoto">
        <div class="chat-attach-icon" style="background:#A855F7;">📷</div>
        <div class="chat-attach-label">Photo</div>
      </div>
      <div class="chat-attach-option" id="attachFile">
        <div class="chat-attach-icon" style="background:#3B82F6;">📄</div>
        <div class="chat-attach-label">File</div>
      </div>
      <div class="chat-attach-option" id="attachGame">
        <div class="chat-attach-icon" style="background:#10B981;">🎮</div>
        <div class="chat-attach-label">Game</div>
      </div>
      <div class="chat-attach-option" id="attachLocation">
        <div class="chat-attach-icon" style="background:#F59E0B;">📍</div>
        <div class="chat-attach-label">Location</div>
      </div>
    </div>
    <div class="chat-input-bar">
      <button class="chat-action-btn" id="chatPlusBtn">＋</button>
      <input type="text" id="chatMsgInput" placeholder="Type a message..." autocomplete="off" autocorrect="off" spellcheck="false">
      <button class="chat-action-btn mic-btn" id="chatMicBtn" title="Voice typing">🎙️</button>
      <button class="chat-action-btn chat-send-btn" id="chatSendBtn">➤</button>
    </div>
    <input type="file" id="chatPhotoInput" accept="image/*" style="display:none">
    <input type="file" id="chatFileInput" style="display:none">
  `;

  document.querySelector('.device').appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('open'));
  activeChatScreen = screen;

  try{
    const cid=chat.firestoreId||chat.id;
    if(cid&&typeof buildDeepLink==='function') history.pushState({chaupaalDeep:true},'',buildDeepLink('chat',cid));
  }catch(e){}

  document.getElementById('chatBack').addEventListener('click', () => {
    screen.classList.remove('open');
    setTimeout(() => screen.remove(), 300);
    try{ history.pushState({},'', '/'); }catch(e){}
  });

  document.getElementById('chatSendBtn').addEventListener('click', () => sendMsg(chat));
  const msgInput = document.getElementById('chatMsgInput');
  msgInput.addEventListener('keypress', e => {if(e.key==='Enter')sendMsg(chat);});
  msgInput.addEventListener('input', () => updateAiSuggestions(msgInput.value));

  // Attach menu toggle
  const attachMenu = document.getElementById('chatAttachMenu');
  document.getElementById('chatPlusBtn').addEventListener('click', (e)=>{
    e.stopPropagation();attachMenu.classList.toggle('show');
  });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('#chatAttachMenu')&&!e.target.closest('#chatPlusBtn')) attachMenu.classList.remove('show');
  });

  document.getElementById('attachPhoto').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    document.getElementById('chatPhotoInput').click();
  });
  document.getElementById('chatPhotoInput').addEventListener('change', async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      let src='';
      if(typeof processAndUploadMedia==='function'&&currentUser&&file.type.startsWith('image/')&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
        showToast('Uploading photo…');
        const up=await processAndUploadMedia(file,{folder:'chat'});
        src=up.media;
      } else {
        src=URL.createObjectURL(file);
      }
      addMsgBubble({from:'me',text:`<img class="chat-img-msg" src="${src}">`,time:'now'}, isGroup);
      if(typeof sendRealtimeMessage==='function') sendRealtimeMessage(chat.id, `[photo] ${src}`, isGroup);
    }catch(err){
      showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||'Photo failed'));
    }
  });
  document.getElementById('attachFile').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    document.getElementById('chatFileInput').click();
  });
  document.getElementById('chatFileInput').addEventListener('change', e=>{
    const file=e.target.files[0];if(!file)return;
    addMsgBubble({from:'me',text:`<div class="chat-file-msg">📄 ${file.name}</div>`,time:'now'}, isGroup);
  });
  document.getElementById('attachGame').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    openGamePicker(chat, isGroup);
  });
  document.getElementById('attachLocation').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    addMsgBubble({from:'me',text:'📍 Location shared',time:'now'}, isGroup);
  });

  // Voice typing (mic)
  let recognition=null;
  const micBtn=document.getElementById('chatMicBtn');
  micBtn.addEventListener('click', ()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){showToast('Voice typing not supported on this browser');return;}
    if(micBtn.classList.contains('recording')){
      recognition?.stop();return;
    }
    recognition = new SR();
    recognition.lang = currentLang==='hi'?'hi-IN':'en-IN';
    recognition.interimResults = false;
    recognition.onstart = () => micBtn.classList.add('recording');
    recognition.onend = () => micBtn.classList.remove('recording');
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      msgInput.value = (msgInput.value + ' ' + transcript).trim();
      updateAiSuggestions(msgInput.value);
    };
    recognition.onerror = () => micBtn.classList.remove('recording');
    recognition.start();
  });

  document.getElementById('chatChallengeBtn').addEventListener('click', () => openChallengeCreator(chat));
  if(!isGroup) document.getElementById('chatMuqabalaBtn')?.addEventListener('click', () => {
    screen.classList.remove('open');
    setTimeout(() => {screen.remove(); startMuqabala(chat.name,'GK');}, 300);
  });

  if(hasDuelStreak) document.getElementById('startRitualBtn')?.addEventListener('click', () => startDailyDuelRitual(chat));

  setTimeout(() => {
    const area = document.getElementById('chatMsgsArea');
    if(area) area.scrollTop = area.scrollHeight;
    // Load real messages from Firestore
    loadRealtimeMessages(chat.id, area, isGroup);
    // Load activity status for DMs
    if(!isGroup&&chat.uid) injectChatActivityStatus(chat.uid);
    else if(!isGroup){ const el=document.getElementById('chatActivityStatus'); if(el) el.textContent=''; }
  }, 100);
}

// ===================== AI SUGGESTION BAR (no autocorrect, smart next-word/emoji) =====================
const QUICK_PHRASES = ["Sounds good!","On my way","Let's do it","Haha 😄","I agree","Not sure yet","Talk later?","Great idea!"];
const EMOJI_KEYWORDS = {
  'good':'👍','great':'🎉','love':'❤️','happy':'😄','sad':'😢','win':'🏆','lol':'😂',
  'cricket':'🏏','game':'🎮','play':'🎲','food':'🍛','tea':'☕','today':'📅','news':'📰',
  'congrats':'🎊','sorry':'🙏','thanks':'🙌','yes':'✅','no':'❌','question':'🤔'
};
let aiSuggestTimeout=null;
function updateAiSuggestions(text,targetInput){
  clearTimeout(aiSuggestTimeout);
  const bar=document.getElementById('aiSuggestionBar');
  if(!bar)return;
  const inp=targetInput||document.getElementById('chatMsgInput');
  const aiChip=`<button class="ai-kb-trigger" onclick="openAiKeyboard(document.getElementById('chatMsgInput'))">✨ Ask AI</button>`;
  if(!text.trim()){
    bar.innerHTML=aiChip+QUICK_PHRASES.slice(0,4).map(p=>`<button class="ai-suggestion-chip" data-val="${p}">${p}</button>`).join('');
    bar.classList.remove('hidden');wireSuggestionChips(bar);return;
  }
  aiSuggestTimeout=setTimeout(()=>{
    const lastWord=text.trim().split(/\s+/).pop().toLowerCase();
    const suggestions=[];
    Object.entries(EMOJI_KEYWORDS).forEach(([kw,emoji])=>{if(lastWord.includes(kw)||kw.includes(lastWord))suggestions.push(emoji);});
    const completions=['definitely','for sure','let me check','sounds perfect'].filter(c=>c.startsWith(lastWord)&&lastWord.length>1);
    const chips=[...new Set([...suggestions,...completions])].slice(0,5);
    bar.innerHTML=aiChip+chips.map(c=>`<button class="ai-suggestion-chip" data-val="${c}">${c}</button>`).join('');
    bar.classList.remove('hidden');wireSuggestionChips(bar);
  },300);
}
function wireSuggestionChips(bar){
  bar.querySelectorAll('.ai-suggestion-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const input=document.getElementById('chatMsgInput');
      if(!input)return;
      const val=chip.dataset.val;
      if(/^\p{Emoji}/u.test(val)) input.value=(input.value+' '+val).trim();
      else input.value=val;
      bar.classList.add('hidden');
      input.focus();
    });
  });
}

function renderMsgBubble(m, isGroup){
  const isMe = m.from === 'me';
  return `
    <div class="msg-row ${isMe?'me':''}">
      ${!isMe?`<div class="msg-avatar-small">${m.avatar||'👤'}</div>`:''}
      <div>
        ${(isGroup&&!isMe&&m.name)?`<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:3px;">${m.name}</div>`:''}
        <div class="msg-bubble ${isMe?'me':'them'}">${m.text}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px;${isMe?'text-align:right':''};">${m.time||''}</div>
      </div>
    </div>
  `;
}

function addMsgBubble(msg, isGroup){
  const area = document.getElementById('chatMsgsArea');
  if(!area) return;
  const div = document.createElement('div');
  div.innerHTML = renderMsgBubble(msg, isGroup);
  area.appendChild(div.firstElementChild);
  area.scrollTop = area.scrollHeight;
}

async function sendMsg(chat){
  const input=document.getElementById('chatMsgInput');
  const text=input?.value.trim();if(!text)return;
  if(typeof checkRateLimit==='function'){
    const rl=await checkRateLimit('message');
    if(!rl.ok){ if(typeof showToast==='function') showToast(rl.message||'Slow down'); return; }
  }
  const unlock=typeof beginClientMutation==='function'?beginClientMutation(`msg_${chat.id}`):()=>{};
  if(unlock===false){ if(typeof showToast==='function') showToast('Sending…'); return; }
  try{
    addMsgBubble({from:'me',text,time:'now'},chat.type==='group');
    input.value='';
    document.getElementById('aiSuggestionBar')?.classList.add('hidden');
    sendRealtimeMessage(chat.id,text,chat.type==='group');
    if(typeof trackMessageSent==='function') trackMessageSent({ chat_type: chat.type||'dm' });
    if(!db||!currentUser) setTimeout(()=>{
      const replies=["Haha 😄","Totally agree!","Really?!","Let's talk later 🙏","Muqabala tomorrow? ⚔️","👍","What's the plan?"];
      addMsgBubble({from:'them',text:replies[Math.floor(Math.random()*replies.length)],time:'now',avatar:chat.avatar},chat.type==='group');
    },1200);
  }finally{ if(typeof unlock==='function') unlock(); }
}

// ===================== DAILY DUEL RITUAL =====================
const RITUAL_QUESTIONS = [
  {q:"When is Mahatma Gandhi's birthday?",options:["September 27","October 2","November 14","January 26"],correct:1},
  {q:"What is India's national animal?",options:["Lion","Elephant","Tiger","Peacock"],correct:2},
  {q:"In which city is the Taj Mahal located?",options:["Delhi","Jaipur","Agra","Lucknow"],correct:2},
  {q:"Which is the largest planet in the solar system?",options:["Saturn","Mars","Jupiter","Neptune"],correct:2},
  {q:"'Jai Hind' kiska nara tha?",options:["Gandhi","Nehru","Subhas Chandra Bose","Patel"],correct:2},
];

function startDailyDuelRitual(chat){
  const questions = [...RITUAL_QUESTIONS].sort(()=>Math.random()-0.5).slice(0,5);
  let qIdx = 0, myAnswers = [], theirAnswers = [];

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;background:var(--cream);z-index:90;display:flex;flex-direction:column;padding:16px;';

  function renderRitualQ(){
    if(qIdx >= questions.length){ showRitualResults(); return; }
    const q = questions[qIdx];
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">🔥 Daily Ritual — Q${qIdx+1}/5</div>
        <button id="closeRitual" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <div style="flex:1;background:var(--white);border-radius:14px;padding:12px;text-align:center;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);">You</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:var(--red);">${myAnswers.filter(a=>a).length}</div>
        </div>
        <div style="flex:1;background:var(--white);border-radius:14px;padding:12px;text-align:center;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);">${chat.name}</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;color:var(--gold);">${theirAnswers.filter(a=>a).length}</div>
        </div>
      </div>
      <div style="background:var(--white);border-radius:20px;padding:22px;flex:1;display:flex;flex-direction:column;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:19px;margin-bottom:20px;flex:1;">${q.q}</div>
        <div style="display:flex;flex-direction:column;gap:10px;" id="ritualOpts">
          ${q.options.map((o,i)=>`<button class="opt" data-i="${i}"><span>${o}</span><span class="mark"></span></button>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--muted);text-align:center;margin-top:12px;" id="waitingFor">Waiting for ${chat.name}...</div>
      </div>
    `;
    document.getElementById('closeRitual').addEventListener('click', () => overlay.remove());

    const opts = overlay.querySelectorAll('.opt');
    opts.forEach(btn => btn.addEventListener('click', () => {
      if(overlay.dataset.myAnswered) return;
      overlay.dataset.myAnswered = 'true';
      const chosen = parseInt(btn.dataset.i);
      const correct = chosen === q.correct;
      myAnswers.push(correct);
      opts.forEach(b => b.disabled = true);
      opts.forEach((b,i) => {
        if(i===q.correct){b.classList.add('correct');b.querySelector('.mark').textContent='✓';}
        else if(i===chosen){b.classList.add('wrong');b.querySelector('.mark').textContent='✕';}
        else b.classList.add('dim');
      });
      SoundLib.playFeedback(correct, 'default');
      // wait for simulated opponent
      const oppDelay = 800 + Math.random()*2000;
      setTimeout(() => {
        const theirCorrect = Math.random() < 0.6;
        theirAnswers.push(theirCorrect);
        const w = overlay.querySelector('#waitingFor');
        if(w) w.textContent = theirCorrect ? `${chat.name} answered correctly ✓` : `${chat.name} got it wrong ✕`;
        // both answered — advance
        setTimeout(() => { qIdx++; delete overlay.dataset.myAnswered; renderRitualQ(); }, 900);
      }, oppDelay);
    }));
  }

  function showRitualResults(){
    const myTotal = myAnswers.filter(a=>a).length;
    const theirTotal = theirAnswers.filter(a=>a).length;
    const won = myTotal > theirTotal;
    const tie = myTotal === theirTotal;
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;">🔥 Ritual complete!</div>
        <button id="closeRitual2" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div style="text-align:center;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
        <div style="font-size:56px;">${tie?'🤝':won?'🎉':'😅'}</div>
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;">${tie?"It's a tie!":won?'You won!':`${chat.name} won this time!`}</div>
        <div style="background:var(--white);border-radius:16px;padding:16px;width:100%;">
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;"><span>You</span><span>${myTotal}/5</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;color:var(--muted);margin-top:8px;"><span>${chat.name}</span><span>${theirTotal}/5</span></div>
        </div>
        <div style="background:rgba(255,201,60,0.12);border:1.5px solid var(--gold);border-radius:14px;padding:14px;width:100%;text-align:center;">
          <div style="font-size:11px;font-weight:700;color:#A8780E;text-transform:uppercase;letter-spacing:0.06em;">🔥 Streak</div>
          <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:28px;color:var(--red);">${(chat.duelStreak||0)+1} days</div>
        </div>
      </div>
      <button style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;" id="closeRitual2Btn">Done 🙏</button>
    `;
    document.getElementById('closeRitual2').addEventListener('click', () => overlay.remove());
    document.getElementById('closeRitual2Btn').addEventListener('click', () => { overlay.remove(); showToast(`See you tomorrow! 🔥 ${(chat.duelStreak||0)+1}-day streak!`); });
  }

  document.querySelector('.device').appendChild(overlay);
  renderRitualQ();
}

// ===================== STORY VIEWER =====================
function openStoryViewer(story, allStories){
  const stories=allStories||[story];
  let currentIdx=stories.indexOf(story);if(currentIdx<0)currentIdx=0;
  let progressInterval=null;

  const viewer=document.createElement('div');
  viewer.className='story-viewer';
  viewer.style.cssText='position:absolute;inset:0;background:#000;z-index:200;display:flex;flex-direction:column;';
  document.querySelector('.device').appendChild(viewer);

  function renderStory(idx){
    clearInterval(progressInterval);
    const s=stories[idx];s.seen=true;
    const isMedia=s.type==='media'||s.type==='duniya_story';
    const isScore=s.type==='score';
    const isBirthday=s.type==='birthday';
    const isDuel=s.type==='duel';
    const timeAgo=s.ts?timeAgoStr(s.ts):'now';
    const visIcon=s.visibility==='close_friends'?'⭐ Close friends':'👥 Friends';

    viewer.innerHTML=`
      <!-- Progress bars -->
      <div style="display:flex;gap:3px;padding:10px 12px 6px;flex-shrink:0;position:relative;z-index:2;">
        ${stories.map((_,i)=>`<div style="flex:1;height:3px;background:rgba(255,255,255,0.35);border-radius:99px;overflow:hidden;"><div id="sp_${i}" style="height:100%;background:#fff;width:${i<idx?'100':i===idx?'0':'0'}%;transition:none;"></div></div>`).join('')}
      </div>
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:4px 14px 10px;position:relative;z-index:2;">
        <div style="width:36px;height:36px;border-radius:50%;background:${s.visibility==='close_friends'?'linear-gradient(45deg,var(--gold),#FF9A3C)':'linear-gradient(45deg,#E63946,#8134AF)'};padding:2px;flex-shrink:0;">
          <div style="width:100%;height:100%;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:16px;">${s.photoURL?`<img src="${s.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:s.avatar}</div>
        </div>
        <div style="flex:1;">
          <div style="color:#fff;font-weight:700;font-size:14px;">${s.name}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">${timeAgo} · ${s.visibility?visIcon:''}</div>
        </div>
        ${s.deletable?`<button id="storyDelete" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:18px;cursor:pointer;">🗑️</button>`:''}
        <button id="storyClose" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px;">✕</button>
      </div>
      <!-- Content -->
      <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;" id="storyContent">
        ${isMedia&&s.media?(
          s.mediaType==='video'
            ?`<video src="${s.media}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
            :`<img src="${s.media}" style="width:100%;height:100%;object-fit:cover;">`
        ):isScore?`
          <div style="background:linear-gradient(160deg,var(--navy),#E63946);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;">
            <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">⚡ Today's Akhbaar</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:80px;color:#fff;line-height:1;">${s.score}</div>
            <div style="font-size:18px;color:rgba(255,255,255,0.7);margin-top:4px;">out of ${s.total}</div>
            <div style="margin-top:24px;background:rgba(255,255,255,0.12);border-radius:16px;padding:14px 24px;text-align:center;">
              <div style="font-size:28px;">🔥 ${s.streak} day streak</div>
            </div>
            <div style="margin-top:20px;font-size:13px;color:rgba(255,255,255,0.5);">Chaupaal · chaupaal-chaupaal.web.app</div>
          </div>
        `:isBirthday?`
          <div style="background:linear-gradient(160deg,var(--gold),#FF9A3C);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
            <div style="font-size:72px;margin-bottom:16px;">🎂</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:28px;color:var(--ink);">Happy Birthday ${s.name}!</div>
            <div style="font-size:15px;color:rgba(43,39,48,0.7);margin-top:12px;line-height:1.5;">Wishing you a wonderful day filled with joy 🎉</div>
          </div>
        `:isDuel?`
          <div style="background:linear-gradient(160deg,var(--navy),#2A3158);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
            <div style="font-size:52px;margin-bottom:16px;">⚔️</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;color:#fff;">${s.text||'Duel result'}</div>
          </div>
        `:`<div style="width:100%;height:100%;background:#111;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:14px;">Story</div>`}
        <!-- Tap zones -->
        <div id="tapPrev" style="position:absolute;left:0;top:0;width:35%;height:100%;cursor:pointer;"></div>
        <div id="tapNext" style="position:absolute;right:0;top:0;width:35%;height:100%;cursor:pointer;"></div>
      </div>
      <!-- Reply bar (for others' stories) -->
      ${s.name!=='You'&&!s.deletable?`
      <div style="display:flex;gap:8px;padding:12px 14px;flex-shrink:0;">
        <input id="storyReplyInput" placeholder="Reply to ${s.name}..." style="flex:1;padding:10px 14px;border-radius:999px;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:14px;outline:none;">
        <button id="storyReplySend" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">↑</button>
      </div>`:''}
    `;

    document.getElementById('storyClose').addEventListener('click',()=>{clearInterval(progressInterval);viewer.remove();});
    document.getElementById('storyDelete')?.addEventListener('click',()=>{clearInterval(progressInterval);viewer.remove();showToast('Story deleted');});
    document.getElementById('tapPrev').addEventListener('click',()=>{if(idx>0){clearInterval(progressInterval);renderStory(idx-1);}else{clearInterval(progressInterval);viewer.remove();}});
    document.getElementById('tapNext').addEventListener('click',()=>{if(idx<stories.length-1){clearInterval(progressInterval);renderStory(idx+1);}else{clearInterval(progressInterval);viewer.remove();}});
    document.getElementById('storyReplySend')?.addEventListener('click',()=>{
      const txt=document.getElementById('storyReplyInput')?.value.trim();
      if(!txt)return;
      const chat=SAMPLE_CHATS.find(c=>c.name===s.name)||{id:'r_'+s.name,name:s.name,avatar:s.avatar||'👤',type:'dm'};
      clearInterval(progressInterval);viewer.remove();
      document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='baithak')b.click();});
      setTimeout(()=>{initBaithak();setTimeout(()=>openChatScreen(chat),300);},200);
    });

    // Animate progress bar
    const fill=document.getElementById(`sp_${idx}`);
    if(fill){
      let w=0;
      progressInterval=setInterval(()=>{
        w+=100/50; // 5 seconds total (100ms interval × 50 = 5000ms)
        fill.style.width=Math.min(w,100)+'%';
        if(w>=100){clearInterval(progressInterval);if(idx<stories.length-1)renderStory(idx+1);else viewer.remove();}
      },100);
    }
  }

  renderStory(currentIdx);
}

// Prefer shared helper from ui-states.js; keep a tiny local fallback.
function timeAgoStr(ts){
  if(typeof formatRelativeTime==='function') return formatRelativeTime(ts);
  const diff=Date.now()-ts;
  if(diff<3600000)return Math.floor(diff/60000)+'m ago';
  if(diff<86400000)return Math.floor(diff/3600000)+'h ago';
  return Math.floor(diff/86400000)+'d ago';
}

// Open Duniya story viewer
function openDuniyaStoryViewer(userItem){
  const storyData={name:userItem.name,avatar:userItem.avatar||'👤',type:'duniya_story',media:null,seen:false,visibility:'public',ts:Date.now()-3600000};
  openStoryViewer(storyData,[storyData]);
}

function showAddStoryOptions(){
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
  sheet.innerHTML=`
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;">Add a Story</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Baithak stories disappear in 24 hours</div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Visible to</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      <label style="display:flex;align-items:center;gap:12px;padding:13px;background:var(--cream);border-radius:12px;cursor:pointer;">
        <input type="radio" name="storyVis" value="friends" checked style="accent-color:var(--red);">
        <div><div style="font-weight:700;font-size:14px;">👥 Friends only</div><div style="font-size:12px;color:var(--muted);">All your Chaupaal friends</div></div>
      </label>
      <label style="display:flex;align-items:center;gap:12px;padding:13px;background:var(--cream);border-radius:12px;cursor:pointer;">
        <input type="radio" name="storyVis" value="close_friends" style="accent-color:var(--red);">
        <div><div style="font-weight:700;font-size:14px;">🌟 Close friends only</div><div style="font-size:12px;color:var(--muted);">Only people you've marked as close friends</div></div>
      </label>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px;background:var(--cream);border:2px solid var(--line);border-radius:14px;cursor:pointer;font-weight:600;font-size:14px;">
        📷 Photo/Video<input type="file" accept="image/*,video/*" id="baithakStoryMedia" style="display:none;">
      </label>
      <button id="baithakStoryScore" style="flex:1;padding:13px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-weight:600;font-size:14px;cursor:pointer;">📊 Share score</button>
    </div>
    <button id="closeBaithakStory" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closeBaithakStory').addEventListener('click',()=>sheet.remove());
  document.getElementById('baithakStoryScore').addEventListener('click',()=>{
    const vis=sheet.querySelector('[name="storyVis"]:checked')?.value||'friends';
    sheet.remove();
    shareAkhbaarScore(vis);
  });
  document.getElementById('baithakStoryMedia').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    const vis=sheet.querySelector('[name="storyVis"]:checked')?.value||'friends';
    sheet.remove();
    try{
      showToast('Uploading story…');
      let media=null, thumb=null;
      if(typeof processAndUploadMedia==='function'&&currentUser&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
        const up=await processAndUploadMedia(file,{folder:'stories'});
        media=up.media; thumb=up.thumb;
      } else {
        media=URL.createObjectURL(file);
      }
      const story={name:userProfile?.name||'You',avatar:userProfile?.photoURL||'🪑',type:'media',media,thumb,mediaType:file.type.startsWith('video')?'video':'image',seen:false,auto:false,deletable:true,visibility:vis,ts:Date.now()};
      addBaithakStory(story);
    }catch(err){
      showToast(typeof friendlyError==='function'?friendlyError(err):(err.message||'Story upload failed'));
    }
  });
}

function addBaithakStory(story){
  saveToArchive({type:'baithak_story',...story,media:story.media&&String(story.media).startsWith('http')?story.media:null,archivedAt:new Date().toISOString()});
  if(db&&currentUser){
    db.collection('baithak_stories').add({
      name:story.name,avatar:story.avatar,type:story.type,
      media: story.media&&String(story.media).startsWith('http')?story.media:null,
      thumb: story.thumb&&String(story.thumb).startsWith('http')?story.thumb:null,
      mediaType:story.mediaType,visibility:story.visibility,
      uid:currentUser.uid,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt:new Date(Date.now()+86400000),
    }).catch(()=>{});
  }
  showToast(story.visibility==='close_friends'?'Story shared with close friends 🌟':'Story shared with your friends 👥');
}

function shareAkhbaarScore(visibility='friends'){
  openStoryViewer({name:userProfile?.name||'You',avatar:'🪑',type:'score',score,total:QUESTIONS.length,streak:parseInt(document.getElementById('streakNum').textContent),seen:false,auto:false,deletable:true,visibility});
  addBaithakStory({name:userProfile?.name||'You',avatar:'🪑',type:'score',seen:false,deletable:true,visibility});
}

function isCloseFriend(uid){
  const cf=JSON.parse(localStorage.getItem('chaupaal_close_friends')||'[]');
  return cf.includes(uid);
}

function toggleCloseFriend(uid,name){
  const cf=JSON.parse(localStorage.getItem('chaupaal_close_friends')||'[]');
  const idx=cf.indexOf(uid);
  if(idx>=0){cf.splice(idx,1);showToast(`${name} removed from close friends`);}
  else{cf.push(uid);showToast(`${name} added to close friends 🌟`);}
  localStorage.setItem('chaupaal_close_friends',JSON.stringify(cf));
}

