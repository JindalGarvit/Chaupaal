// ===================== CHAT SCREEN =====================
let activeChatScreen = null;
/** @type {SpeechRecognition|null} */
let activeChatRecognition = null;
/** @type {((e: MouseEvent) => void)|null} */
let activeChatAttachDocClick = null;

/**
 * Single cleanup path for chat close (← button, history back, replace chat, Muqabala handoff).
 * Closes nested overlays (AI keyboard, games, challenge creator, ritual, pickers) and
 * tears down listeners / realtime / mic / suggestion timers.
 */
function closeChatScreen(opts = {}) {
  const { updateHistory = true, animate = true } = opts;

  if (typeof pauseAllMusic === 'function') pauseAllMusic();
  if (typeof stopChatPresence === 'function') stopChatPresence();

  if (typeof endOverlayScope === 'function') {
    endOverlayScope(typeof OVERLAY_SCOPE_CHAT === 'string' ? OVERLAY_SCOPE_CHAT : 'chat');
  } else if (typeof closeAiKeyboard === 'function') {
    closeAiKeyboard();
  }

  if (typeof aiSuggestTimeout !== 'undefined' && aiSuggestTimeout) {
    clearTimeout(aiSuggestTimeout);
    aiSuggestTimeout = null;
  }

  try {
    activeChatRecognition?.stop?.();
  } catch (e) {}
  activeChatRecognition = null;

  if (activeChatAttachDocClick) {
    document.removeEventListener('click', activeChatAttachDocClick);
    activeChatAttachDocClick = null;
  }

  if (typeof activeChatListener !== 'undefined' && activeChatListener) {
    try {
      activeChatListener();
    } catch (e) {}
    activeChatListener = null;
  }

  const screen = activeChatScreen || document.getElementById('activeChatScreen');
  activeChatScreen = null;

  if (screen) {
    const finish = () => {
      try {
        screen.remove();
      } catch (e) {}
    };
    if (animate && screen.classList.contains('open')) {
      screen.classList.remove('open');
      setTimeout(finish, 300);
    } else {
      finish();
    }
  }

  if (updateHistory) {
    try {
      if (location.pathname && location.pathname !== '/' && !opts.fromHistory) {
        history.pushState({}, '', '/');
      }
    } catch (e) {}
  }
}

function openChatScreen(chat){
  // Replace any existing chat with full cleanup (nested panels included)
  if (activeChatScreen || document.getElementById('activeChatScreen')) {
    closeChatScreen({ updateHistory: false, animate: false });
  }

  const screen = document.createElement('div');
  screen.id = 'activeChatScreen';
  screen.className = 'chat-screen';
  const msgs = SAMPLE_MESSAGES[chat.id] || [];
  const isSelf = typeof isSelfChat==='function' && isSelfChat(chat);
  const isChaupaal = typeof isChaupaalChat==='function' && isChaupaalChat(chat);
  const isGroup = chat.type === 'group';
  const hasDuelStreak = !isGroup && !isSelf && !isChaupaal && chat.duelStreak;
  screen.dataset.chatId = chat.firestoreId || chat.id || '';
  if (isChaupaal) screen.dataset.chaupaal = '1';
  window.currentOpenChat = chat;

  const statusLine = isChaupaal
    ? 'Your space with Chaupaal'
    : (isSelf ? 'Notes to self · testing space' : 'Checking activity…');
  const placeholder = isChaupaal
    ? 'Talk with Chaupaal…'
    : (isSelf ? 'Write a note to yourself...' : 'Type a message...');

  screen.innerHTML = `
    <div class="chat-screen-header">
      <button class="chat-back" id="chatBack" aria-label="Back">←</button>
      <div class="chat-header-avatar">${chat.avatar}</div>
      <div>
        <div class="chat-header-name">${chat.name}</div>
        <div id="chatActivityStatus" style="font-size:11px;color:var(--muted);">${statusLine}</div>
      </div>
      <div class="chat-header-actions">
        ${!isSelf&&!isChaupaal?`<button class="chat-header-btn" id="chatChallengeBtn" title="Create challenge">🎯</button>`:''}
        ${!isGroup&&!isSelf&&!isChaupaal?`<button class="chat-header-btn" id="chatMuqabalaBtn" title="Muqabala">⚔️</button>`:''}
        ${isGroup?`<button class="chat-header-btn" id="chatLeaveGroupBtn" title="Leave group">🚪</button>`:''}
      </div>
    </div>
    <div id="chatTypingStatus" class="chat-typing-status hidden" aria-live="polite"></div>
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
      <div class="chat-attach-option" id="attachSong">
        <div class="chat-attach-icon" style="background:#E63946;">🎵</div>
        <div class="chat-attach-label">Song</div>
      </div>
      <div class="chat-attach-option" id="attachLocation">
        <div class="chat-attach-icon" style="background:#F59E0B;">📍</div>
        <div class="chat-attach-label">Location</div>
      </div>
    </div>
    <div class="chat-input-bar">
      <button class="chat-action-btn" id="chatPlusBtn" aria-label="Attach">＋</button>
      <input type="text" id="chatMsgInput" placeholder="${placeholder}" autocomplete="off" autocorrect="off" spellcheck="false">
      <button class="chat-action-btn mic-btn" id="chatMicBtn" title="Voice typing" aria-label="Voice typing">🎙️</button>
      <button class="chat-action-btn chat-send-btn" id="chatSendBtn" aria-label="Send message">➤</button>
    </div>
    <input type="file" id="chatPhotoInput" accept="image/*" style="display:none">
    <input type="file" id="chatFileInput" style="display:none">
  `;

  document.querySelector('.device').appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('open'));
  activeChatScreen = screen;

  if (typeof beginOverlayScope === 'function') {
    beginOverlayScope(typeof OVERLAY_SCOPE_CHAT === 'string' ? OVERLAY_SCOPE_CHAT : 'chat', screen);
  }
  if (typeof enableSwipeBack === 'function') {
    enableSwipeBack(screen, () => closeChatScreen({ updateHistory: true, animate: true }));
  }
  if (typeof bindZoomableImages === 'function') bindZoomableImages(screen);

  if(!isSelf && !isChaupaal && typeof mountIcebreakerBanner==='function') mountIcebreakerBanner(screen, chat);
  if(!isSelf && !isChaupaal && typeof mountConversationRepairChips==='function') {
    try { mountConversationRepairChips(screen, chat); } catch (e) {}
  }

  try{
    const cid=chat.firestoreId||chat.id;
    if(cid&&typeof buildDeepLink==='function') history.pushState({chaupaalDeep:true},'',buildDeepLink('chat',cid));
  }catch(e){}

  document.getElementById('chatBack').addEventListener('click', () => {
    closeChatScreen({ updateHistory: true, animate: true });
  });

  if (!isSelf && !isChaupaal && typeof bindProfileLongPress === 'function') {
    const headerAvatar = screen.querySelector('.chat-header-avatar');
    const profile = {
      uid: chat.uid || chat.otherUid || chat.peerUid || chat.id?.replace?.(/^chat_profile_|^dm_|^chat_/, '') || '',
      name: chat.name,
      avatar: chat.avatar,
      photoURL: chat.photoURL || (/^https:/.test(chat.avatar || '') ? chat.avatar : ''),
    };
    if (profile.uid && profile.uid !== currentUser?.uid) {
      bindProfileLongPress(headerAvatar, profile);
    }
    bindMsgAvatarLongPress(screen, profile);
  }

  document.getElementById('chatSendBtn').addEventListener('click', () => sendMsg(chat));
  const msgInput = document.getElementById('chatMsgInput');
  msgInput?.addEventListener('keypress', e => {if(e.key==='Enter')sendMsg(chat);});
  msgInput?.addEventListener('input', () => {
    if (!isChaupaal) updateAiSuggestions(msgInput.value);
    if (!isChaupaal && typeof signalChatTyping === 'function') signalChatTyping(chat.firestoreId || chat.id);
  });
  if (!isChaupaal && typeof startChatPresence === 'function') startChatPresence(chat);
  if (isChaupaal) {
    try { if (typeof ensureChaupaalChatDoc === 'function') ensureChaupaalChatDoc(); } catch (e) {}
    try { if (typeof hydrateChaupaalQuietState === 'function') hydrateChaupaalQuietState(screen); } catch (e) {}
    // Hide attach game / challenge affordances for system chat
    document.getElementById('attachGame')?.classList.add('hidden');
  }
  document.getElementById('chatLeaveGroupBtn')?.addEventListener('click', () => leaveGroupChat(chat));

  // Attach menu toggle
  const attachMenu = document.getElementById('chatAttachMenu');
  document.getElementById('chatPlusBtn').addEventListener('click', (e)=>{
    e.stopPropagation();attachMenu.classList.toggle('show');
  });
  activeChatAttachDocClick = (e)=>{
    if(!e.target.closest('#chatAttachMenu')&&!e.target.closest('#chatPlusBtn')) attachMenu.classList.remove('show');
  };
  document.addEventListener('click', activeChatAttachDocClick);

  document.getElementById('attachPhoto').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    document.getElementById('chatPhotoInput').click();
  });
  document.getElementById('chatPhotoInput').addEventListener('change', async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      let src='', mediaWidth=0, mediaHeight=0;
      if(typeof processAndUploadMedia==='function'&&currentUser&&file.type.startsWith('image/')&&(typeof isMediaUploadReady!=='function'||await isMediaUploadReady())){
        showToast('Uploading photo…');
        const up=await processAndUploadMedia(file,{folder:'chat'});
        src=up.media;
        mediaWidth=Number(up.width)||0;
        mediaHeight=Number(up.height)||0;
      } else {
        src=URL.createObjectURL(file);
      }
      const sizeAttrs=mediaWidth&&mediaHeight?` width="${mediaWidth}" height="${mediaHeight}" style="aspect-ratio:${mediaWidth}/${mediaHeight};"`:'';
      addMsgBubble({from:'me',text:`📷 Photo`,attachment:{type:'photo',url:src,width:mediaWidth,height:mediaHeight},time:'now',pending:true}, isGroup);
      if(typeof sendRealtimeMessage==='function'){
        sendRealtimeMessage(chat.firestoreId||chat.id, '📷 Photo', isGroup, null, {
          type:'photo', url:src, width:mediaWidth||null, height:mediaHeight||null,
        });
      }
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
    const name=file.name||'File';
    addMsgBubble({from:'me',text:`📄 ${name}`,attachment:{type:'file',name},time:'now',pending:true}, isGroup);
    if(typeof sendRealtimeMessage==='function'){
      sendRealtimeMessage(chat.firestoreId||chat.id, `📄 ${name}`, isGroup, null, { type:'file', name });
    }
  });
  document.getElementById('attachGame').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    openGamePicker(chat, isGroup);
  });
  document.getElementById('attachSong')?.addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    if(typeof openSongPicker!=='function'){showToast('Song sharing unavailable');return;}
    openSongPicker({
      title:'Share a song',
      onSelect:(music)=>{
        try{
          addMsgBubble({from:'me',text:music.title?`🎵 ${music.title}`:'🎵 Song',music,time:'now',pending:true}, isGroup);
          if(typeof sendRealtimeMessage==='function'){
            sendRealtimeMessage(chat.firestoreId||chat.id, music.title?`🎵 ${music.title}`:'🎵 Song', isGroup, music);
          }
        }catch(e){
          showToast('Could not share song');
        }
      },
    });
  });
  document.getElementById('attachLocation').addEventListener('click',()=>{
    attachMenu.classList.remove('show');
    addMsgBubble({from:'me',text:'📍 Location shared',attachment:{type:'location',label:'Location shared'},time:'now',pending:true}, isGroup);
    if(typeof sendRealtimeMessage==='function'){
      sendRealtimeMessage(chat.firestoreId||chat.id, '📍 Location shared', isGroup, null, { type:'location', label:'Location shared' });
    }
  });

  // Voice typing (mic)
  const micBtn=document.getElementById('chatMicBtn');
  micBtn.addEventListener('click', ()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){showToast('Voice typing not supported on this browser');return;}
    if(micBtn.classList.contains('recording')){
      activeChatRecognition?.stop();return;
    }
    activeChatRecognition = new SR();
    activeChatRecognition.lang = currentLang==='hi'?'hi-IN':'en-IN';
    activeChatRecognition.interimResults = false;
    activeChatRecognition.onstart = () => micBtn.classList.add('recording');
    activeChatRecognition.onend = () => micBtn.classList.remove('recording');
    activeChatRecognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      msgInput.value = (msgInput.value + ' ' + transcript).trim();
      updateAiSuggestions(msgInput.value);
    };
    activeChatRecognition.onerror = () => micBtn.classList.remove('recording');
    activeChatRecognition.start();
  });

  document.getElementById('chatChallengeBtn')?.addEventListener('click', () => openChallengeCreator(chat));
  if(!isGroup&&!isSelf) document.getElementById('chatMuqabalaBtn')?.addEventListener('click', () => {
    closeChatScreen({ updateHistory: true, animate: true });
    setTimeout(() => startMuqabala(chat.name,'GK'), 320);
  });

  if(hasDuelStreak) document.getElementById('startRitualBtn')?.addEventListener('click', () => startDailyDuelRitual(chat));

  setTimeout(() => {
    const area = document.getElementById('chatMsgsArea');
    if(area) area.scrollTop = area.scrollHeight;
    // Load real messages from Firestore
    loadRealtimeMessages(chat.firestoreId || chat.id, area, isGroup);
    // Load activity status for DMs (never for self/Chaupaal — system chats keep their own subtitle)
    if(isSelf||isChaupaal){ /* keep notes / quiet subtitle */ }
    else if(!isGroup&&chat.uid) injectChatActivityStatus(chat.uid);
    else if(!isGroup){ const el=document.getElementById('chatActivityStatus'); if(el) el.textContent=''; }
  }, 100);
}

window.closeChatScreen = closeChatScreen;

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
  const uid = m.uid || m.user?.uid || '';
  const name = m.name || m.user?.name || '';
  let body = m.text || '';
  const att = m.attachment || null;

  // Legacy photo encoding
  if(!att && typeof body==='string' && body.startsWith('[photo] ')){
    const url=body.slice(8).trim();
    if(url) body=`<img class="chat-img-msg" src="${url.replace(/"/g,'&quot;')}" decoding="async" alt="">`;
  }

  if(m.music && typeof renderMusicCard==='function'){
    const card=renderMusicCard(m.music,{variant:'chat'});
    const caption=(typeof m.text==='string' && m.text && !m.text.includes('data-music-card') && !/^🎵\s/.test(m.text))?`<div class="music-card-caption">${m.text}</div>`:'';
    body=card+(caption||'');
  } else if(att && att.type==='photo' && att.url){
    const sizeAttrs=att.width&&att.height?` width="${att.width}" height="${att.height}" style="aspect-ratio:${att.width}/${att.height};"`:'';
    body=`<img class="chat-img-msg" src="${String(att.url).replace(/"/g,'&quot;')}" decoding="async" alt=""${sizeAttrs}>`;
  } else if(att && att.type==='file'){
    body=`<div class="chat-file-msg">📄 ${String(att.name||'File').replace(/</g,'&lt;')}</div>`;
  } else if(att && att.type==='location'){
    body=`<div class="chat-location-msg">📍 ${String(att.label||'Location shared').replace(/</g,'&lt;')}</div>`;
  } else if(att && att.type==='muqabala_challenge'){
    const n=Array.isArray(att.questions)?att.questions.length:0;
    const secs=att.timerSeconds||60;
    const cid=String(att.challengeId||'').replace(/"/g,'&quot;');
    if(cid && Array.isArray(att.questions) && att.questions.length){
      window.__pendingMuqabalaChallenges = window.__pendingMuqabalaChallenges || {};
      window.__pendingMuqabalaChallenges[att.challengeId] = {
        questions: att.questions,
        timerSeconds: secs,
        mode: 'Custom',
        source: 'manual',
      };
      try{ localStorage.setItem('chaupaal_challenge_'+att.challengeId, JSON.stringify(window.__pendingMuqabalaChallenges[att.challengeId])); }catch(e){}
    }
    body=`<div class="msg-bubble-challenge-inner challenge"><div class="challenge-label">⚔️ Custom Challenge</div><div class="challenge-title">${n} questions · ${secs}s</div><button class="challenge-btn" type="button" data-muqabala-challenge="${cid}">Answer →</button></div>`;
  }

  // Strip raw HTML from plain text unless we intentionally set rich body above
  if(!m.music && !att && typeof body==='string' && !body.startsWith('<') && body.includes('<')){
    body=body.replace(/</g,'&lt;');
  }

  return `
    <div class="msg-row ${isMe?'me':''}" data-uid="${uid}" data-name="${String(name).replace(/"/g,'&quot;')}"${m.pending?' data-pending="1"':''}>
      ${!isMe?`<div class="msg-avatar-small">${m.avatar||'👤'}</div>`:''}
      <div>
        ${(isGroup&&!isMe&&m.name)?`<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:3px;">${m.name}</div>`:''}
        <div class="msg-bubble ${isMe?'me':'them'}${att&&att.type==='muqabala_challenge'?' challenge':''}" data-msg-text="${String(m.text||'').replace(/"/g,'&quot;')}">${body}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px;${isMe?'text-align:right':''};">${m.time||''}</div>
      </div>
    </div>
  `;
}

function wireChallengeBubble(root){
  root?.querySelectorAll?.('[data-muqabala-challenge]').forEach((btn)=>{
    if(btn.dataset.wired==='1') return;
    btn.dataset.wired='1';
    btn.addEventListener('click',()=>{
      const id=btn.dataset.muqabalaChallenge;
      if(typeof launchPendingMuqabalaChallenge==='function') launchPendingMuqabalaChallenge(id);
      else if(typeof showToast==='function') showToast('Challenge unavailable');
    });
  });
}
window.wireChallengeBubble=wireChallengeBubble;

function bindMsgAvatarLongPress(root, fallbackProfile){
  if(typeof bindProfileLongPress!=='function'||!root) return;
  root.querySelectorAll('.msg-avatar-small').forEach((el)=>{
    if(el.dataset.lpBound) return;
    const row=el.closest('.msg-row');
    const uid=row?.dataset?.uid||fallbackProfile?.uid||'';
    if(!uid||uid===currentUser?.uid) return;
    el.dataset.lpBound='1';
    bindProfileLongPress(el,{
      uid,
      name:row?.dataset?.name||fallbackProfile?.name||'Member',
      avatar:el.textContent?.trim()||fallbackProfile?.avatar||'👤',
    });
  });
}

function addMsgBubble(msg, isGroup){
  const area = document.getElementById('chatMsgsArea');
  if(!area) return;
  const div = document.createElement('div');
  div.innerHTML = renderMsgBubble(msg, isGroup);
  const node=div.firstElementChild;
  area.appendChild(node);
  bindMsgAvatarLongPress(node);
  if(typeof mountMusicCards==='function') mountMusicCards(node);
  if(typeof wireChallengeBubble==='function') wireChallengeBubble(node);
  area.scrollTop = area.scrollHeight;
}

async function sendMsg(chat){
  const input=document.getElementById('chatMsgInput');
  const text=input?.value.trim();if(!text)return;
  const isGroup=chat.type==='group';
  const isChaupaal = typeof isChaupaalChat==='function' && isChaupaalChat(chat);
  const tempId='local_'+Date.now();
  const bubble={from:'me',text,time:'now',_tempId:tempId,pending:true};
  const prevValue=input.value;

  const apply=()=>{
    addMsgBubble(bubble,isGroup);
    input.value='';
    document.getElementById('aiSuggestionBar')?.classList.add('hidden');
    if(typeof SoundLib!=='undefined'&&SoundLib.send) SoundLib.send();
    if(typeof haptic==='function') haptic('light');
  };
  const revert=()=>{
    const area=document.getElementById('chatMsgsArea');
    const rows=area?.querySelectorAll('.msg-row.me');
    if(rows&&rows.length){
      // remove last pending me bubble matching text
      for(let i=rows.length-1;i>=0;i--){
        const b=rows[i].querySelector('.msg-bubble');
        if(b&&b.textContent===text){ rows[i].remove(); break; }
      }
    }
    input.value=prevValue;
  };

  const unlock=typeof beginClientMutation==='function'?beginClientMutation(`msg_${chat.id}`):()=>{};
  if(unlock===false){ if(typeof showToast==='function') showToast('Sending…'); return; }

  const sendBtn=document.getElementById('chatSendBtn');
  if(sendBtn) sendBtn.disabled=true;
  try{
    if(typeof runOptimistic==='function'){
      await runOptimistic({
        apply,
        revert,
        commit:async()=>{
          if(typeof assertRateLimit==='function') await assertRateLimit('message');
          if(isChaupaal && typeof sendChaupaalMessage==='function'){
            const area=document.getElementById('chatMsgsArea');
            const hist=[];
            area?.querySelectorAll('.msg-row')?.forEach(row=>{
              const t=row.querySelector('.msg-bubble')?.textContent||'';
              if(!t) return;
              hist.push({ role: row.classList.contains('me') ? 'user' : 'assistant', content: t });
            });
            const data = await sendChaupaalMessage(text, hist.slice(-12));
            if(data?.quiet){
              // In-voice "back soon" bubble — never a silent failure or error state
              if(typeof applyChaupaalQuietComposer==='function'){
                applyChaupaalQuietComposer(document.getElementById('activeChatScreen'), true);
              }
              addMsgBubble({from:'them',text:data.message||"Chaupaal is resting right now — back soon. 🌙",time:'now',avatar:'🏠'}, false);
              return;
            }
            if(data?.reply){
              addMsgBubble({from:'them',text:data.reply,time:'now',avatar:'🏠'}, false);
            }
            if(typeof trackMessageSent==='function') trackMessageSent({ chat_type: 'chaupaal' });
            return;
          }
          if(typeof sendRealtimeMessage==='function'){
            await sendRealtimeMessage(chat.firestoreId||chat.id,text,isGroup);
          }
          if(typeof trackMessageSent==='function') trackMessageSent({ chat_type: chat.type||'dm' });
          if(typeof publishChatTyping==='function') publishChatTyping(chat.firestoreId||chat.id,false);
          if(typeof demoMarkSeenSoon==='function') demoMarkSeenSoon();
          if(!isChaupaal && (!db||!currentUser)) setTimeout(()=>{
            const replies=["Haha 😄","Totally agree!","Really?!","Let's talk later 🙏","Muqabala tomorrow? ⚔️","👍","What's the plan?"];
            if(typeof startChatPresence==='function'){ /* typing already demoed */ }
            addMsgBubble({from:'them',text:replies[Math.floor(Math.random()*replies.length)],time:'now',avatar:chat.avatar},isGroup);
            if(typeof demoMarkSeenSoon==='function') demoMarkSeenSoon();
          },1200);
        },
        errorToast:'Message not sent — undone',
      });
    }else{
      apply();
      if(isChaupaal && typeof sendChaupaalMessage==='function'){
        const data = await sendChaupaalMessage(text, []);
        if(data?.reply) addMsgBubble({from:'them',text:data.reply,time:'now',avatar:'🏠'}, false);
      } else if(typeof sendRealtimeMessage==='function') {
        sendRealtimeMessage(chat.firestoreId||chat.id,text,isGroup);
      }
    }
  }finally{ if(sendBtn) sendBtn.disabled=false; if(typeof unlock==='function') unlock(); }
}

function leaveGroupChat(chat){
  if(!chat||chat.type!=='group') return;
  if(typeof baithakChats==='undefined'||!Array.isArray(baithakChats)) return;
  const idx=baithakChats.findIndex(c=>c.id===chat.id||c.firestoreId===chat.firestoreId);
  if(idx<0) return;
  const item=baithakChats[idx];
  baithakChats.splice(idx,1);
  closeChatScreen({ updateHistory:true, animate:true });
  if(typeof renderChatList==='function') renderChatList(baithakChats);
  if(typeof showUndoToast==='function'){
    showUndoToast({
      message:`Left ${chat.name||'group'}`,
      onUndo:()=>{
        baithakChats.splice(idx,0,item);
        if(typeof renderChatList==='function') renderChatList(baithakChats);
        if(typeof showToast==='function') showToast('Back in the group');
      },
    });
  } else if(typeof showToast==='function'){
    showToast(`Left ${chat.name||'group'}`);
  }
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
function safeStoryText(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function openStoryViewer(story, allStories){
  const stories=allStories||[story];
  let currentIdx=stories.indexOf(story);if(currentIdx<0)currentIdx=0;
  let progressInterval=null;

  const viewer=document.createElement('div');
  viewer.className='story-viewer';
  viewer.style.cssText='position:absolute;inset:0;background:#000;z-index:200;display:flex;flex-direction:column;';
  document.querySelector('.device').appendChild(viewer);
  viewer.addEventListener('chaupaal:dismiss', () => {
    clearInterval(progressInterval);
    if(typeof pauseAllMusic==='function') pauseAllMusic();
  });

  function renderStory(idx){
    clearInterval(progressInterval);
    if(typeof pauseAllMusic==='function') pauseAllMusic();
    const s=stories[idx];s.seen=true;
    const isMedia=s.type==='media'||s.type==='duniya_story';
    const isScore=s.type==='score';
    const isBirthday=s.type==='birthday';
    const isDuel=s.type==='duel';
    const hasMusic=!!(s.music&&s.music.title);
    const musicOnly=hasMusic&&!(isMedia&&s.media);
    const timeAgo=(s.ts||s.createdAt)?timeAgoStr(s.ts||s.createdAt):'now';
    const destinationLabel=s.destination==='duniya'?'Duniya':s.destination==='baithak'?'Baithak':'';
    const ownerAudience=s.own&&s.visibility==='close_friends'?' · Close Friends':'';
    const musicOverlay=hasMusic&&typeof renderMusicCard==='function'
      ?renderMusicCard(s.music,{variant:'story'})
      :'';

    viewer.innerHTML=`
      <!-- Progress bars -->
      <div style="display:flex;gap:3px;padding:10px 12px 6px;flex-shrink:0;position:relative;z-index:2;">
        ${stories.map((_,i)=>`<div style="flex:1;height:3px;background:rgba(255,255,255,0.35);border-radius:99px;overflow:hidden;"><div id="sp_${i}" style="height:100%;background:#fff;width:${i<idx?'100':i===idx?'0':'0'}%;transition:none;"></div></div>`).join('')}
      </div>
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:4px 14px 10px;position:relative;z-index:2;">
        <div class="story-viewer-avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(45deg,#E63946,#8134AF);padding:2px;flex-shrink:0;">
          <div style="width:100%;height:100%;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;font-size:16px;">${s.photoURL||/^https:/.test(s.avatar||'')?`<img src="${s.photoURL||s.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:s.avatar}</div>
        </div>
        <div style="flex:1;">
          <div style="color:#fff;font-weight:700;font-size:14px;">${s.name}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">${timeAgo}${destinationLabel?` · <span class="story-destination-tag story-destination-tag--${s.destination}">${destinationLabel}${ownerAudience}</span>`:''}</div>
        </div>
        ${s.deletable?`<button id="storyDelete" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:18px;cursor:pointer;">🗑️</button>`:''}
        <button id="storyClose" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px;">✕</button>
      </div>
      <!-- Content -->
      <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;" id="storyContent">
        ${musicOnly?`<div class="story-music-backdrop" aria-hidden="true"></div>`:
          isMedia&&s.media?(
          s.mediaType==='video'
            ?`<video src="${s.media}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
            :`<img src="${s.media}" style="width:100%;height:100%;object-fit:${s.rotation?'contain':'cover'};transform:rotate(${Number(s.rotation)||0}deg);">`
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
        ${s.text?`<div class="story-viewer-text">${safeStoryText(s.text)}</div>`:''}
        ${musicOverlay}
        ${s.sharedGameId?`<button type="button" class="story-game-card" id="storyGameCard">Play ${safeStoryText(typeof getGame==='function'?(getGame(s.sharedGameId)?.name||'game'):'game')}</button>`:''}
        <!-- Tap zones -->
        <div id="tapPrev" style="position:absolute;left:0;top:0;width:35%;height:100%;cursor:pointer;"></div>
        <div id="tapNext" style="position:absolute;right:0;top:0;width:35%;height:100%;cursor:pointer;"></div>
      </div>
      ${s.id&&s.destination?`
      <div class="story-interactions">
        <div class="story-interaction-actions">
          <button type="button" id="storyLike" aria-label="Like story">♡ <span id="storyLikeCount">0</span></button>
          <button type="button" id="storyCommentsToggle">Comments</button>
        </div>
        <div id="storyComments" class="story-comments hidden"></div>
        <div class="story-comment-compose">
          <input id="storyReplyInput" maxlength="500" placeholder="Comment on this story…">
          <button type="button" id="storyReplySend">↑</button>
        </div>
      </div>`:(s.name!=='You'&&!s.deletable?`
      <div style="display:flex;gap:8px;padding:12px 14px;flex-shrink:0;">
        <input id="storyReplyInput" placeholder="Reply to ${s.name}..." style="flex:1;padding:10px 14px;border-radius:999px;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:14px;outline:none;">
        <button id="storyReplySend" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">↑</button>
      </div>`:'')}
    `;

    document.getElementById('storyClose').addEventListener('click',()=>{clearInterval(progressInterval);if(typeof pauseAllMusic==='function')pauseAllMusic();viewer.remove();});
    if(!s.own&&s.uid&&typeof bindProfileLongPress==='function'){
      bindProfileLongPress(viewer.querySelector('.story-viewer-avatar'),{
        uid:s.uid,name:s.name,avatar:s.avatar,
        photoURL:s.photoURL||(/^https:/.test(s.avatar||'')?s.avatar:''),
      });
    }
    document.getElementById('storyDelete')?.addEventListener('click',async()=>{
      clearInterval(progressInterval);
      if(s.id&&s.destination&&typeof deletePlatformStory==='function'){
        try{await deletePlatformStory(s);showToast('Story removed from live view');}
        catch(error){showToast(error?.message||'Could not delete story');return;}
      }
      viewer.remove();
      if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
    });
    document.getElementById('tapPrev').addEventListener('click',()=>{if(idx>0){clearInterval(progressInterval);renderStory(idx-1);}else{clearInterval(progressInterval);if(typeof pauseAllMusic==='function')pauseAllMusic();viewer.remove();}});
    document.getElementById('tapNext').addEventListener('click',()=>{if(idx<stories.length-1){clearInterval(progressInterval);renderStory(idx+1);}else{clearInterval(progressInterval);if(typeof pauseAllMusic==='function')pauseAllMusic();viewer.remove();}});
    if(typeof mountMusicCards==='function') mountMusicCards(viewer);
    if(typeof enhanceMediaIn==='function') enhanceMediaIn(viewer);
    document.getElementById('storyReplySend')?.addEventListener('click',async()=>{
      const txt=document.getElementById('storyReplyInput')?.value.trim();
      if(!txt)return;
      if(s.id&&s.destination&&typeof commentPlatformStory==='function'){
        try{
          await commentPlatformStory(s,txt);
          document.getElementById('storyReplyInput').value='';
          await hydrateStoryInteractions();
          document.getElementById('storyComments')?.classList.remove('hidden');
        }catch(error){showToast(error?.message||'Comment could not be sent');}
        return;
      }
      const chat=SAMPLE_CHATS.find(c=>c.name===s.name)||{id:'r_'+s.name,name:s.name,avatar:s.avatar||'👤',type:'dm'};
      clearInterval(progressInterval);viewer.remove();
      document.querySelectorAll('.tab-btn').forEach(b=>{if(b.dataset.tab==='baithak')b.click();});
      setTimeout(()=>{initBaithak();setTimeout(()=>openChatScreen(chat),300);},200);
    });

    let storyLiked=false;
    async function hydrateStoryInteractions(){
      if(!s.id||!s.destination||typeof getStoryInteractions!=='function')return;
      try{
        const info=await getStoryInteractions(s);
        storyLiked=!!info.liked;
        const like=document.getElementById('storyLike');
        if(like) like.firstChild.textContent=storyLiked?'♥ ':'♡ ';
        const count=document.getElementById('storyLikeCount');
        if(count) count.textContent=info.likeCount||0;
        const comments=document.getElementById('storyComments');
        if(comments) comments.innerHTML=info.comments?.length
          ?info.comments.map(c=>`<div class="story-comment"><strong>${safeStoryText(c.name)}</strong><span>${safeStoryText(c.text)}</span></div>`).join('')
          :'<div class="story-comment-empty">No comments yet.</div>';
      }catch(error){}
    }
    document.getElementById('storyLike')?.addEventListener('click',async()=>{
      const next=!storyLiked;
      try{await likePlatformStory(s,next);storyLiked=next;await hydrateStoryInteractions();}
      catch(error){showToast(error?.message||'Like could not be saved');}
    });
    document.getElementById('storyCommentsToggle')?.addEventListener('click',()=>{
      clearInterval(progressInterval);
      document.getElementById('storyComments')?.classList.toggle('hidden');
    });
    document.getElementById('storyReplyInput')?.addEventListener('focus',()=>clearInterval(progressInterval));
    document.getElementById('storyGameCard')?.addEventListener('click',()=>{
      clearInterval(progressInterval);
      const game=typeof getGame==='function'?getGame(s.sharedGameId):null;
      if(game){viewer.remove();game.launch({source:'story'});}
      else showToast('Game unavailable');
    });
    hydrateStoryInteractions();

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
  showBaithakShareMenu();
}

async function addBaithakStory(story){
  if(typeof createPlatformStory!=='function')throw new Error('Story service unavailable');
  const created=await createPlatformStory({destination:'baithak',kind:'story',...story});
  if(typeof renderLiveBaithakStories==='function')renderLiveBaithakStories();
  return created;
}

async function shareAkhbaarScore(visibility='friends'){
  try{
    const stats=typeof getAkhbaarShareStats==='function'?getAkhbaarShareStats():{
      score,total:QUESTIONS.length,
      streak:parseInt(document.getElementById('streakNum')?.textContent,10)||0,
      scoreLine:`${score}/${QUESTIONS.length}`,
    };
    if(typeof postGameScoreStory==='function'){
      const created=await postGameScoreStory('akhbaar',{
        ...stats,
        destination:'baithak',
        visibility,
      });
      if(created&&typeof openStoryViewer==='function') openStoryViewer(created,[created]);
      return created;
    }
    const created=await addBaithakStory({
      type:'score',visibility,
      score,total:QUESTIONS.length,
      streak:parseInt(document.getElementById('streakNum')?.textContent,10)||0,
    });
    openStoryViewer(created,[created]);
    return created;
  }catch(error){showToast(error?.message||'Score story could not be shared');}
}

// ===================== BAITHAK STORY CREATION =====================
function showBaithakShareMenu(){
  if(typeof showActionSheet!=='function') return openBaithakStoryComposer('camera');
  showActionSheet('Share in Baithak',[
    {label:'⚡ Instant',hint:'Snaps to Close Friends (or Friends if that list is empty). No editing — short undo window.',fn:openBaithakInstantCamera},
    {label:'📷 Create a story',hint:'Camera with text, stickers, games, and audience controls.',fn:()=>openBaithakStoryComposer('camera')},
    {label:'🖼️ Upload a story',hint:'Pick from gallery, then edit before sharing with Friends or Close Friends.',fn:()=>openBaithakStoryComposer('gallery')},
    {label:'🎵 Share a song',hint:'In-app music card — searchable, playable preview. No external apps.',fn:shareBaithakSongStory},
  ]);
}

async function shareBaithakSongStory(){
  if(typeof openSongPicker!=='function'){showToast('Song sharing unavailable');return;}
  openSongPicker({
    title:'Share a song to Stories',
    onSelect:async(music)=>{
      try{
        showToast('Sharing song…');
        const created=await createPlatformStory({
          destination:'baithak',
          kind:'story',
          visibility:'friends',
          type:'media',
          text:'',
          music,
        });
        if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
        if(typeof haptic==='function') haptic('success');
        showToast('Song shared with Friends');
        if(created&&typeof openStoryViewer==='function') openStoryViewer(created,[created]);
      }catch(error){
        showToast(error?.message||'Could not share song');
      }
    },
  });
}

function chooseBaithakMedia(mode,onFile){
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/*,video/*';
  if(mode==='camera'){
    input.accept='image/*';
    input.setAttribute('capture','environment');
  }
  input.addEventListener('change',()=>{
    const file=input.files?.[0];
    if(file) onFile(file);
  },{once:true});
  input.click();
}

/** In-app camera capture when getUserMedia is available; falls back to file input. */
function openInAppCamera({onCapture,facingMode='environment'}={}){
  if(!navigator.mediaDevices?.getUserMedia){
    chooseBaithakMedia('camera',onCapture);
    return;
  }
  const overlay=document.createElement('div');
  overlay.className='story-camera';
  overlay.innerHTML=`
    <video class="story-camera-video" playsinline autoplay muted></video>
    <canvas class="story-camera-canvas hidden"></canvas>
    <div class="story-camera-chrome">
      <button type="button" data-cam-close aria-label="Close">✕</button>
      <div class="story-camera-hint">Instant · Close Friends</div>
      <button type="button" data-cam-flip aria-label="Flip camera">↻</button>
    </div>
    <button type="button" class="story-camera-shutter" data-cam-shutter aria-label="Capture"></button>`;
  document.querySelector('.device')?.appendChild(overlay);
  let stream=null;
  let facing=facingMode;
  const video=overlay.querySelector('video');
  const canvas=overlay.querySelector('canvas');

  const stop=()=>{
    stream?.getTracks?.().forEach(t=>t.stop());
    stream=null;
    overlay.remove();
  };

  const start=async()=>{
    try{
      stream?.getTracks?.().forEach(t=>t.stop());
      stream=await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},
      });
      video.srcObject=stream;
      await video.play();
    }catch(e){
      stop();
      chooseBaithakMedia('camera',onCapture);
    }
  };

  overlay.querySelector('[data-cam-close]').addEventListener('click',stop);
  overlay.querySelector('[data-cam-flip]').addEventListener('click',()=>{
    facing=facing==='environment'?'user':'environment';
    start();
  });
  overlay.querySelector('[data-cam-shutter]').addEventListener('click',()=>{
    if(!video.videoWidth)return;
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    canvas.getContext('2d').drawImage(video,0,0);
    canvas.toBlob((blob)=>{
      if(!blob)return;
      const file=new File([blob],`instant_${Date.now()}.jpg`,{type:'image/jpeg'});
      stop();
      onCapture(file);
    },'image/jpeg',0.92);
  });
  start();
}

function openBaithakInstantCamera(){
  if(!currentUser){showToast('Sign in to share an Instant');return;}
  openInAppCamera({onCapture:(file)=>{
    const preview=URL.createObjectURL(file);
    const pending=document.createElement('div');
    pending.className='instant-pending';
    pending.innerHTML=`<img src="${preview}" alt=""><div><strong>Instant ready</strong><span>Sharing to Close Friends in 5s…</span><small>If your Close Friends list is empty, Friends will see it instead.</small></div><button type="button">Undo</button>`;
    document.querySelector('.device')?.appendChild(pending);
    let cancelled=false;
    const timer=setTimeout(async()=>{
      if(cancelled)return;
      pending.querySelector('span').textContent='Sharing…';
      try{
        if(typeof processAndUploadMedia!=='function') throw new Error('Media upload unavailable');
        const up=await processAndUploadMedia(file,{folder:'stories'});
        const created=await createPlatformStory({
          destination:'baithak',kind:'instant',visibility:'close_friends',
          type:'media',media:up.media,thumb:up.thumb,
          mediaType:file.type.startsWith('video')?'video':'image',
        });
        pending.remove();
        URL.revokeObjectURL(preview);
        renderLiveBaithakStories();
        if(created?.audienceFallback==='friends'){
          showToast('Instant shared with Friends — add Close Friends for a private list');
        }else{
          showToast('Instant shared with Close Friends');
        }
      }catch(error){
        pending.remove();
        URL.revokeObjectURL(preview);
        showToast(error?.message||'Instant could not be shared');
      }
    },5000);
    pending.querySelector('button').addEventListener('click',()=>{
      cancelled=true;clearTimeout(timer);pending.remove();URL.revokeObjectURL(preview);
      showToast('Instant undone');
    });
  }});
}

function openBaithakStoryComposer(mode){
  if(!currentUser){showToast('Sign in to create a story');return;}
  if(mode==='camera'){
    openInAppCamera({
      onCapture:(file)=>showBaithakStoryEditor(file,'camera'),
    });
    return;
  }
  chooseBaithakMedia(mode,(file)=>showBaithakStoryEditor(file,mode));
}

function showBaithakStoryEditor(file,mode){
  const preview=URL.createObjectURL(file);
  const editor=document.createElement('div');
  editor.className='story-editor';
  let rotation=0;
  let filter='none';
  let textColor='#ffffff';
  editor.innerHTML=`
    <div class="story-editor-header">
      <button type="button" data-story-cancel>←</button>
      <strong>${mode==='camera'?'Create a story':'Upload a story'}</strong>
      <button type="button" data-story-share>Share</button>
    </div>
    <div class="story-editor-preview" data-story-preview>
      ${file.type.startsWith('video')?`<video src="${preview}" controls playsinline></video>`:`<img src="${preview}" alt="" data-story-img>`}
      <canvas class="story-draw-canvas" data-story-draw></canvas>
      <div class="story-sticker-layer" data-story-stickers></div>
      <div data-story-overlay class="story-viewer-text"></div>
    </div>
    <div class="story-editor-tools">
      <div class="story-editor-tool-row">
        <label class="story-editor-field">Text
          <input maxlength="160" placeholder="Add text" data-story-text>
        </label>
        <button type="button" data-story-text-color title="Text colour">Aa</button>
        ${file.type.startsWith('image')?'<button type="button" data-story-rotate>↻</button>':''}
      </div>
      <div class="story-editor-filters" data-story-filters>
        ${[['none','Original'],['warm','Warm'],['cool','Cool'],['mono','Mono'],['vivid','Vivid']].map(([id,label])=>
          `<button type="button" data-filter="${id}" class="${id==='none'?'is-active':''}">${label}</button>`
        ).join('')}
      </div>
      <div class="story-sticker-pack" data-story-sticker-pack aria-label="Stickers">
        ${['🔥','✨','❤️','😂','🙏','☕','🏏','🎵'].map(s=>`<button type="button" class="story-sticker-btn" data-sticker="${s}">${s}</button>`).join('')}
      </div>
      <div class="story-draw-row">
        <button type="button" class="btn" data-story-draw-toggle>Draw</button>
        <button type="button" class="btn" data-story-draw-clear>Clear draw</button>
        <span style="font-size:11px;color:var(--muted);">Light doodle on top of media</span>
      </div>
      <label class="story-editor-field">Audience
        <select data-story-audience>
          <option value="friends">Friends — mutual connections only</option>
          <option value="close_friends">Close Friends — private list (only you manage it)</option>
        </select>
      </label>
      <p class="story-editor-note">Close Friends is invisible to others — recipients never see that a selective list exists.</p>
      <label class="story-editor-field">Game card
        <select data-story-game>
          <option value="">No game attached</option>
          ${typeof getGames==='function'?getGames({dangal:true}).map(game=>`<option value="${game.id}">${game.icon} ${game.name}</option>`).join(''):''}
        </select>
      </label>
      <div class="story-editor-tool-row" style="align-items:center;gap:10px;">
        <button type="button" class="btn" data-story-song aria-label="Share a song">🎵 Song</button>
        <span data-story-song-label style="font-size:12px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">No song attached</span>
        <button type="button" class="btn hidden" data-story-song-clear aria-label="Remove song">✕</button>
      </div>
      <div class="story-editor-plus-row">
        <button type="button" class="story-plus-btn" data-story-plus aria-label="Add more">＋</button>
        <span>Tap for camera · long-press for Instant / Create / Upload</span>
      </div>
    </div>`;
  document.querySelector('.device')?.appendChild(editor);
  let selectedMusic=null;
  const songLabel=editor.querySelector('[data-story-song-label]');
  const songClear=editor.querySelector('[data-story-song-clear]');
  const updateSongLabel=()=>{
    if(selectedMusic){
      songLabel.textContent=`${selectedMusic.title} · ${selectedMusic.artist}`;
      songClear?.classList.remove('hidden');
    }else{
      songLabel.textContent='No song attached';
      songClear?.classList.add('hidden');
    }
  };
  editor.querySelector('[data-story-song]')?.addEventListener('click',()=>{
    if(typeof openSongPicker!=='function'){showToast('Song sharing unavailable');return;}
    openSongPicker({
      title:'Attach a song',
      onSelect:(music)=>{
        selectedMusic=music;
        updateSongLabel();
      },
    });
  });
  songClear?.addEventListener('click',()=>{
    selectedMusic=null;
    updateSongLabel();
  });
  const img=editor.querySelector('[data-story-img]');
  const stickerLayer=editor.querySelector('[data-story-stickers]');
  const drawCanvas=editor.querySelector('[data-story-draw]');
  const previewBox=editor.querySelector('[data-story-preview]');
  let drawing=false;
  let drawOn=false;
  const stickersPlaced=[];
  const sizeCanvas=()=>{
    if(!drawCanvas||!previewBox)return;
    const r=previewBox.getBoundingClientRect();
    drawCanvas.width=Math.max(1,Math.floor(r.width));
    drawCanvas.height=Math.max(1,Math.floor(r.height));
  };
  sizeCanvas();
  const ctx=drawCanvas?.getContext('2d');
  if(ctx){ctx.strokeStyle='#FFE66D';ctx.lineWidth=3;ctx.lineCap='round';}
  const pointerPos=(e)=>{
    const r=drawCanvas.getBoundingClientRect();
    const t=e.touches?.[0]||e;
    return {x:t.clientX-r.left,y:t.clientY-r.top};
  };
  const startDraw=(e)=>{if(!drawOn||!ctx)return;drawing=true;const p=pointerPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault();};
  const moveDraw=(e)=>{if(!drawing||!ctx)return;const p=pointerPos(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault();};
  const endDraw=()=>{drawing=false;};
  drawCanvas?.addEventListener('mousedown',startDraw);
  drawCanvas?.addEventListener('mousemove',moveDraw);
  drawCanvas?.addEventListener('mouseup',endDraw);
  drawCanvas?.addEventListener('mouseleave',endDraw);
  drawCanvas?.addEventListener('touchstart',startDraw,{passive:false});
  drawCanvas?.addEventListener('touchmove',moveDraw,{passive:false});
  drawCanvas?.addEventListener('touchend',endDraw);
  editor.querySelector('[data-story-draw-toggle]')?.addEventListener('click',(e)=>{
    drawOn=!drawOn;
    drawCanvas?.classList.toggle('is-drawing',drawOn);
    e.currentTarget.textContent=drawOn?'Drawing…':'Draw';
    e.currentTarget.classList.toggle('btn--primary',drawOn);
  });
  editor.querySelector('[data-story-draw-clear]')?.addEventListener('click',()=>{
    if(ctx&&drawCanvas)ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
  });
  editor.querySelectorAll('[data-sticker]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const emoji=btn.dataset.sticker;
      const x=30+Math.random()*40;
      const y=30+Math.random()*40;
      stickersPlaced.push({emoji,x,y});
      const el=document.createElement('span');
      el.className='story-sticker-float';
      el.textContent=emoji;
      el.style.left=x+'%';
      el.style.top=y+'%';
      stickerLayer?.appendChild(el);
      btn.classList.add('is-active');
      setTimeout(()=>btn.classList.remove('is-active'),200);
    });
  });
  const applyFilter=()=>{
    if(!img)return;
    const map={none:'none',warm:'sepia(.35) saturate(1.2)',cool:'hue-rotate(20deg) saturate(1.1)',mono:'grayscale(1)',vivid:'contrast(1.2) saturate(1.35)'};
    img.style.filter=map[filter]||'none';
  };
  const cleanup=()=>{editor.remove();URL.revokeObjectURL(preview);};
  editor.querySelector('[data-story-cancel]').addEventListener('click',cleanup);
  editor.querySelector('[data-story-text]').addEventListener('input',(event)=>{
    editor.querySelector('[data-story-overlay]').textContent=event.target.value;
    editor.querySelector('[data-story-overlay]').style.color=textColor;
  });
  editor.querySelector('[data-story-text-color]')?.addEventListener('click',()=>{
    const colors=['#ffffff','#FFE66D','#E63946','#2A9D8F','#000000'];
    textColor=colors[(colors.indexOf(textColor)+1)%colors.length];
    editor.querySelector('[data-story-overlay]').style.color=textColor;
  });
  editor.querySelector('[data-story-rotate]')?.addEventListener('click',()=>{
    rotation=(rotation+90)%360;
    if(img) img.style.transform=`rotate(${rotation}deg)`;
  });
  editor.querySelectorAll('[data-filter]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      filter=btn.dataset.filter;
      editor.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('is-active',b===btn));
      applyFilter();
    });
  });
  const plus=editor.querySelector('[data-story-plus]');
  plus?.addEventListener('click',()=>{cleanup();openBaithakStoryComposer('camera');});
  if(typeof onLongPress==='function'&&plus){
    onLongPress(plus,()=>{cleanup();showBaithakShareMenu();});
  }
  editor.querySelector('[data-story-share]').addEventListener('click',async(buttonEvent)=>{
    const button=buttonEvent.currentTarget;
    button.disabled=true;button.textContent='Sharing…';
    try{
      if(typeof processAndUploadMedia!=='function') throw new Error('Media upload unavailable');
      const up=await processAndUploadMedia(file,{folder:'stories'});
      const stickerNote=stickersPlaced.map(s=>s.emoji).join('');
      const baseText=editor.querySelector('[data-story-text]').value||'';
      const created=await createPlatformStory({
        destination:'baithak',kind:'story',
        visibility:editor.querySelector('[data-story-audience]').value,
        type:'media',media:up.media,thumb:up.thumb,
        mediaType:file.type.startsWith('video')?'video':'image',
        rotation,
        text:stickerNote?`${baseText}${baseText?' ':''}${stickerNote}`.trim():baseText,
        sharedGameId:editor.querySelector('[data-story-game]').value,
        music:selectedMusic||undefined,
      });
      cleanup();
      renderLiveBaithakStories();
      if(typeof haptic==='function') haptic('success');
      if(created?.audienceFallback==='friends'){
        showToast('Shared with Friends — your Close Friends list was empty');
      }else if(editor.querySelector('[data-story-audience]').value==='close_friends'){
        showToast('Story shared with Close Friends');
      }else{
        showToast('Story shared with Friends');
      }
    }catch(error){
      button.disabled=false;button.textContent='Share';
      showToast(error?.message||'Story could not be shared');
    }
  });
}

