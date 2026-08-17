// ===================== BAITHAK INIT =====================
function initBaithak(){
  const panel=document.getElementById('panel-baithak');
  if(!panel)return;
  if(!panel.dataset.baithakChromeWired){
    panel.dataset.baithakChromeWired='1';
    document.getElementById('baithakOverflowBtn')?.addEventListener('click',(e)=>{
      e.stopPropagation();
      openBaithakOverflowMenu(e.currentTarget);
    });
    // Legacy FAB / stories row if still present
    document.getElementById('baithakFab')?.addEventListener('click',showNewChatOptions);
    const addStoryBtn=document.getElementById('addStoryBtn');
    addStoryBtn?.addEventListener('click',()=>{
      if(addStoryBtn.dataset.suppressClick==='1'){
        addStoryBtn.dataset.suppressClick='0';
        return;
      }
      if(typeof openBaithakInstantComposer==='function') openBaithakInstantComposer();
      else if(typeof openBaithakStoryComposer==='function') openBaithakStoryComposer('camera');
      else if(typeof showAddStoryOptions==='function') showAddStoryOptions();
    });
    document.getElementById('baithakSearch')?.addEventListener('input',e=>{
      const q=e.target.value.toLowerCase();
      if(q.startsWith('@')&&q.length>1&&typeof openUniversalSearch==='function'){
        openUniversalSearch({initialQuery:q.slice(1),types:['users']});
        e.target.value='';
        return;
      }
      renderChatList(typeof getBaithakChatsForSearch==='function'?getBaithakChatsForSearch(q):(typeof pinSelfChat==='function'?pinSelfChat([]):[]));
    });
    if(typeof bindLivingPlaceholder==='function'){
      bindLivingPlaceholder(document.getElementById('baithakSearch'),'baithak_search');
    }
  }
  if(currentUser&&typeof renderBaithakInstants==='function') renderBaithakInstants();
  else if(currentUser&&typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
  else if(typeof renderStories==='function') renderStories();
  if(typeof baithakChats!=='undefined') baithakChats = typeof pinSelfChat==='function' ? pinSelfChat(baithakChats) : baithakChats;
  if(!currentUser){
    const samples=typeof SAMPLE_CHATS!=='undefined'?SAMPLE_CHATS.filter((c)=>c.isSample||c.type==='self'):[];
    const guest=typeof pinSelfChat==='function'?pinSelfChat(samples):samples;
    renderChatList(guest);
    if(typeof mountBaithakFriendRequests==='function') mountBaithakFriendRequests();
    return;
  }
  if(typeof setBaithakSection==='function'){
    setBaithakSection('sabha');
  } else {
    renderChatList(typeof baithakChats!=='undefined'?baithakChats:(typeof pinSelfChat==='function'?pinSelfChat([]):[]));
  }
  if(typeof mountBaithakFriendRequests==='function') mountBaithakFriendRequests();
  if(db&&currentUser&&typeof loadBaithakChatsPage==='function'){
    loadBaithakChatsPage({reset:true})
      .then(()=>{
        if(typeof baithakChats!=='undefined') baithakChats = pinSelfChat(baithakChats);
        if(typeof setBaithakSection==='function') setBaithakSection('sabha');
        else renderChatList(baithakChats);
        if(typeof mountBaithakFriendRequests==='function') mountBaithakFriendRequests();
      })
      .catch(()=>{
        if(typeof baithakChatLoadError!=='undefined') baithakChatLoadError=true;
        renderChatList(typeof baithakChats!=='undefined'?pinSelfChat(baithakChats):(typeof pinSelfChat==='function'?pinSelfChat([]):[]));
      });
  }
}

/** Vertical ⋮ — New chat · New group · Find people · Settings (icons on each row). */
function openBaithakOverflowMenu(anchor){
  document.getElementById('baithakOverflowMenu')?.remove();
  const menu=document.createElement('div');
  menu.id='baithakOverflowMenu';
  menu.className='baithak-overflow-menu';
  menu.setAttribute('role','menu');
  const tt=(k,f)=>{ try{ if(typeof t==='function'){ const v=t(k); if(v&&v!==k) return v; } }catch(e){} return f; };
  const ic=(name)=>typeof iconHtml==='function'?iconHtml(name,{size:18,className:'baithak-menu-icon'}):'';
  menu.innerHTML=`
    <button type="button" role="menuitem" class="cp-menu-item" data-baithak-menu="new_chat">${ic('message-circle')}<span>${tt('baithak_menu_new_chat','New chat')}</span></button>
    <button type="button" role="menuitem" class="cp-menu-item" data-baithak-menu="new_group">${ic('users')}<span>${tt('baithak_menu_new_group','New group')}</span></button>
    <button type="button" role="menuitem" class="cp-menu-item" data-baithak-menu="find">${ic('search')}<span>${tt('shortcut_baithak_search','Find people')}</span></button>
    <button type="button" role="menuitem" class="cp-menu-item" data-baithak-menu="settings">${ic('settings')}<span>${tt('baithak_menu_settings','Settings')}</span></button>`;
  const host=document.querySelector('.device')||document.body;
  host.appendChild(menu);
  const rect=anchor?.getBoundingClientRect?.();
  const hostRect=host.getBoundingClientRect?.()||{top:0,left:0,right:window.innerWidth,height:window.innerHeight};
  if(rect){
    menu.style.top=`${Math.min(rect.bottom-hostRect.top+4, (hostRect.height||600)-160)}px`;
    menu.style.right=`${Math.max(8, hostRect.right-rect.right)}px`;
  }
  const close=()=>{ document.removeEventListener('pointerdown',onOut,true); menu.remove(); };
  const onOut=(e)=>{ if(!menu.contains(e.target)&&e.target!==anchor) close(); };
  setTimeout(()=>document.addEventListener('pointerdown',onOut,true),0);
  menu.querySelectorAll('[data-baithak-menu]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.dataset.baithakMenu;
      close();
      if(id==='new_chat') showNewDmSearchSheet();
      else if(id==='new_group') showCreateGroup();
      else if(id==='find'){
        if(typeof openPeopleSearchWithContacts==='function') openPeopleSearchWithContacts({surface:'baithak'});
        else showNewDmSearchSheet();
      } else if(id==='settings' && typeof openSettingsModal==='function') openSettingsModal();
    });
  });
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
    const payload = {
      questions: engineQs,
      timerSeconds,
      opponent: chat.name,
      mode: source === 'ai' ? 'AI' : 'Custom',
      source: source === 'ai' ? 'ai' : 'manual',
    };
    window.__pendingMuqabalaChallenges[challengeId] = payload;
    try{ localStorage.setItem('chaupaal_challenge_'+challengeId, JSON.stringify(payload)); }catch(e){}
    addMsgBubble({
      from:'me',
      text:`⚔️ Challenge · ${engineQs.length}q`,
      attachment:{
        type:'muqabala_challenge',
        challengeId,
        questions: engineQs,
        timerSeconds,
        label:`${engineQs.length} questions · ${timerSeconds}s`,
      },
      time:'now',
      pending:true,
    }, chat.type==='group');
    if(typeof sendRealtimeMessage==='function'){
      sendRealtimeMessage(
        chat.firestoreId||chat.id,
        `⚔️ Challenge · ${engineQs.length}q`,
        chat.type==='group',
        null,
        {
          type:'muqabala_challenge',
          challengeId,
          questions: engineQs,
          timerSeconds,
          label:`${engineQs.length} questions · ${timerSeconds}s · for ${chat.name}`,
        }
      );
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
      showToast(t('baithak_challenge_sent',{name:chat.name}));
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

function showNewDmSearchSheet(opts){
  if(typeof currentUser==='undefined'||!currentUser){
    if(typeof showGuestSignInBanner==='function') showGuestSignInBanner();
    if(typeof showAuth==='function') showAuth();
    else if(typeof showToast==='function') showToast('Sign in to message people');
    return;
  }
  const sheet=document.createElement('div');
  sheet.className='new-dm-sheet';
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;';
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;padding:16px;background:var(--white);border-bottom:1px solid var(--line);">
      <button type="button" id="closeNewDm" style="background:none;border:none;font-size:22px;cursor:pointer;">←</button>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">Start a new conversation</div>
    </div>
    <div style="padding:12px 16px;">
      <input id="newDmSearch" type="search" autocomplete="off" placeholder="Search by name or @username"
        style="width:100%;padding:12px 14px;border:2px solid var(--line);border-radius:14px;font-size:15px;box-sizing:border-box;outline:none;">
      <button type="button" class="btn" id="newDmContactsBtn" style="margin-top:10px;width:100%;">Find from contacts</button>
    </div>
    <div id="newDmResults" style="flex:1;overflow:auto;padding:0 16px 24px;"></div>`;
  document.querySelector('.device')?.appendChild(sheet);
  const close=()=>sheet.remove();
  sheet.querySelector('#closeNewDm')?.addEventListener('click',close);
  if(typeof pushNavLayer==='function'){ sheet.dataset.navManaged='1'; pushNavLayer(sheet,close); }
  const input=sheet.querySelector('#newDmSearch');
  const results=sheet.querySelector('#newDmResults');
  sheet.querySelector('#newDmContactsBtn')?.addEventListener('click',()=>{
    if(typeof loadContactsInto==='function') loadContactsInto(results);
  });
  if(typeof ContactsFind!=='undefined'&&ContactsFind.supported&&ContactsFind.supported()){
    results.innerHTML=`<div class="contacts-fallback">${typeof t==='function'?t('contacts_soft_prompt'):'Optional: find friends already on Chaupaal from your contacts. We never upload your full address book.'}</div>`;
  } else if(opts&&opts.withContacts&&typeof loadContactsInto==='function'){
    loadContactsInto(results);
  }
  let timer=null;
  async function runSearch(q){
    results.innerHTML='<div style="padding:16px;color:var(--muted);font-size:13px;">Searching…</div>';
    try{
      const rows=typeof searchUsersProvider==='function'
        ? await searchUsersProvider(q,{limit:20})
        : [];
      if(!rows.length){
        results.innerHTML='<div style="padding:16px;color:var(--muted);font-size:13px;">No people found</div>';
        return;
      }
      results.innerHTML=rows.map(r=>`
        <button type="button" class="new-dm-row" data-uid="${r.uid||''}" data-name="${(r.name||r.username||'').replace(/"/g,'&quot;')}" data-avatar="${(r.avatar||'👤').replace(/"/g,'&quot;')}"
          style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;border:0;border-bottom:1px solid var(--line);background:transparent;cursor:pointer;text-align:left;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--white);display:grid;place-items:center;overflow:hidden;">${r.photoURL?`<img src="${r.photoURL}" style="width:100%;height:100%;object-fit:cover;">`:'👤'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">${r.name||r.username||'User'}</div>
            <div style="font-size:12px;color:var(--muted);">@${r.username||'user'}</div>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--red);">Message</span>
        </button>`).join('');
      results.querySelectorAll('.new-dm-row').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          const uid=btn.dataset.uid;
          if(!uid) return;
          if(uid===currentUser?.uid){
            if(typeof showToast==='function') showToast("That's you");
            return;
          }
          if(typeof dismissedUids!=='undefined'&&dismissedUids instanceof Set&&dismissedUids.has(uid)){
            if(typeof showToast==='function') showToast("You've blocked this person");
            return;
          }
          close();
          if(typeof openDmWithSharedHello==='function'){
            await openDmWithSharedHello({
              uid,
              name:btn.dataset.name||'Friend',
              avatar:btn.dataset.avatar||'👤',
              starterText:'Hi!',
              origin:'new_dm',
            });
          }
        });
      });
    }catch(e){
      results.innerHTML='<div style="padding:16px;color:var(--red);font-size:13px;">Search failed — try again</div>';
    }
  }
  input?.addEventListener('input',()=>{
    clearTimeout(timer);
    const q=input.value.trim();
    if(q.length<1){ results.innerHTML=''; return; }
    timer=setTimeout(()=>runSearch(q),280);
  });
  setTimeout(()=>input?.focus(),100);
}

function showNewChatOptions(){
  const bodyHtml=`
    <button type="button" class="btn btn--block" data-new="dm" style="margin-bottom:8px;text-align:left;">💬 Start a new conversation</button>
    <button type="button" class="btn btn--block" data-new="group" style="margin-bottom:8px;text-align:left;">👥 Gather a group</button>`;
  if(typeof openHalfSheet==='function'){
    openHalfSheet({
      id:'baithakNewChatSheet',
      title: typeof t==='function' ? (t('baithak_menu_new_chat')||'New chat') : 'New chat',
      accent:'baithak',
      bodyHtml,
      onMount:(sheet,close)=>{
        sheet.querySelector('[data-new="dm"]')?.addEventListener('click',()=>{close();showNewDmSearchSheet();});
        sheet.querySelector('[data-new="group"]')?.addEventListener('click',()=>{close();showCreateGroup();});
      },
    });
    return;
  }
  const sheet=document.createElement('div');
  sheet.style.cssText='position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
  sheet.innerHTML=`<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:14px;">New chat</div>${bodyHtml}
    <button id="closeSheet2" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>`;
  document.querySelector('.device').appendChild(sheet);
  sheet.querySelector('[data-new="dm"]')?.addEventListener('click',()=>{sheet.remove();showNewDmSearchSheet();});
  sheet.querySelector('[data-new="group"]')?.addEventListener('click',()=>{sheet.remove();showCreateGroup();});
  sheet.querySelector('#closeSheet2')?.addEventListener('click',()=>sheet.remove());
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
    <div style="font-size:13px;color:var(--muted);margin:12px 0 8px;line-height:1.45;">After you create the group, you can copy a real invite link from group info.</div>
    <button style="margin-top:auto;width:100%;padding:15px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;" id="createGrpBtn">Create group</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closeGrp').addEventListener('click',()=>sheet.remove());
  if(typeof pushNavLayer==='function'){
    sheet.dataset.navManaged='1';
    pushNavLayer(sheet,()=>sheet.remove());
  }
  document.getElementById('createGrpBtn').addEventListener('click',async()=>{
    const name=document.getElementById('grpName').value.trim();
    if(!name){showToast(t('baithak_enter_group'));return;}
    const desc=document.getElementById('grpDesc')?.value?.trim()||'';
    sheet.remove();
    if(typeof createGroupInFirestore==='function'){
      const chat=await createGroupInFirestore({name,description:desc});
      if(chat){
        showToast(t('baithak_group_created',{name}));
        if(typeof openChatScreen==='function') openChatScreen(chat);
      }
    } else showToast(t('baithak_group_created',{name}));
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
        if(navigator.share)navigator.share({text});else{navigator.clipboard.writeText(text);showToast(t('baithak_copied'));}
      }
    });
    wrap.querySelector('.wrap-page').addEventListener('click',e=>{if(e.target.closest('button'))return;idx++;if(idx>=pages.length)wrap.remove();else renderPage();});
  }
  document.querySelector('.device').appendChild(wrap);renderPage();
}

// ===================== JOURNAL CHECK-IN (half-sheet via JournalCheckIn) =====================
function journalLocalDayKey(){
  if (typeof JournalCheckIn?.istDateKey === 'function') return JournalCheckIn.istDateKey();
  try{
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }catch(e){
    return new Date().toISOString().slice(0,10);
  }
}
function journalWindowKey(kind, win){
  const date = journalLocalDayKey();
  const w = win || (typeof JournalCheckIn?.journalWindow === 'function' ? JournalCheckIn.journalWindow() : null) || 'evening';
  return `chaupaal_journal_${kind}_${date}_${w}`;
}
function journalSnoozeUntil(){
  try{ return Number(localStorage.getItem('chaupaal_journal_snooze_until')||'0')||0; }catch(e){ return 0; }
}
/** Sync gate for graphic cards / events — window-scoped dismiss + done + snooze. */
function canShowJournalPrompt(){
  try{
    const win = typeof JournalCheckIn?.journalWindow === 'function' ? JournalCheckIn.journalWindow() : null;
    if (!win) return false;
    if (localStorage.getItem(journalWindowKey('done', win))) return false;
    if (localStorage.getItem(journalWindowKey('dismissed', win))) return false;
    const until = journalSnoozeUntil();
    if (until && Date.now() < until) return false;
  }catch(e){}
  return true;
}
function markJournalDoneToday(){
  try{
    const win = typeof JournalCheckIn?.journalWindow === 'function' ? JournalCheckIn.journalWindow() : 'evening';
    if (win) localStorage.setItem(journalWindowKey('done', win), '1');
    localStorage.removeItem('chaupaal_journal_snooze_until');
  }catch(e){}
}
function markJournalDismissedToday(){
  try{
    const win = typeof JournalCheckIn?.journalWindow === 'function' ? JournalCheckIn.journalWindow() : 'evening';
    if (win) localStorage.setItem(journalWindowKey('dismissed', win), '1');
    localStorage.removeItem('chaupaal_journal_snooze_until');
  }catch(e){}
}
/** Single snooze window — later resnooze replaces, never stacks. Default +3h, same calendar day. */
function snoozeJournalPrompt(hours){
  const h=Math.max(1, Math.min(8, Number(hours)||3));
  let until=Date.now()+h*60*60*1000;
  try{
    const parts=journalLocalDayKey().split('-').map(Number);
    const end=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],18,29,59)); // ~23:59 IST
    if(until>end.getTime()) until=end.getTime();
  }catch(e){}
  try{ localStorage.setItem('chaupaal_journal_snooze_until',String(until)); }catch(e){}
  return until;
}
window.canShowJournalPrompt=canShowJournalPrompt;
window.markJournalDoneToday=markJournalDoneToday;
window.markJournalDismissedToday=markJournalDismissedToday;
window.snoozeJournalPrompt=snoozeJournalPrompt;

/** Bridge: old day-check modal → JournalCheckIn half-sheet. */
function showDayCheck(opts){
  const o = opts || {};
  if (typeof maybeShowJournalCheckIn === 'function') {
    const p = maybeShowJournalCheckIn(o);
    if (p && typeof p.then === 'function') p.catch(() => {});
    return true;
  }
  if (typeof JournalCheckIn?.maybeShow === 'function') {
    const p = JournalCheckIn.maybeShow(o);
    if (p && typeof p.then === 'function') p.catch(() => {});
    return true;
  }
  if (typeof openJournalComposeSheet === 'function') {
    openJournalComposeSheet({ window: o.window || (typeof JournalCheckIn?.journalWindow === 'function' ? JournalCheckIn.journalWindow() : null) || 'anytime' });
    return true;
  }
  return false;
}
window.showDayCheck = showDayCheck;

function scheduleEveningCheckIn(){
  if (typeof JournalCheckIn?.scheduleWatch === 'function') {
    JournalCheckIn.scheduleWatch();
    return;
  }
}
window.scheduleEveningCheckIn=scheduleEveningCheckIn;
