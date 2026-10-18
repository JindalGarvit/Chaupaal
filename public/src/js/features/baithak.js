// ===================== BAITHAK INIT =====================
let baithakFriendRequestPoll = null;

function startBaithakFriendRequestPoll() {
  stopBaithakFriendRequestPoll();
  if (typeof currentUser === 'undefined' || !currentUser) return;
  if (typeof mergePendingFriendRequests === 'function') mergePendingFriendRequests();
  baithakFriendRequestPoll = setInterval(() => {
    if (typeof mergePendingFriendRequests === 'function') mergePendingFriendRequests();
    else if (typeof mountBaithakFriendRequests === 'function') mountBaithakFriendRequests();
  }, 60000);
}

function stopBaithakFriendRequestPoll() {
  if (baithakFriendRequestPoll) {
    clearInterval(baithakFriendRequestPoll);
    baithakFriendRequestPoll = null;
  }
}

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
      if(typeof expandBaithakSplitComposer==='function') expandBaithakSplitComposer();
      else if(typeof openBaithakInstantComposer==='function') openBaithakInstantComposer();
      else if(typeof showAddStoryOptions==='function') showAddStoryOptions();
    });
    document.getElementById('baithakSearch')?.removeAttribute('data-baithak-inline-wired');
    if(typeof bindLivingPlaceholder==='function'){
      bindLivingPlaceholder(document.getElementById('baithakSearch'),'baithak_search');
    }
  }
  if(typeof renderBaithakInstants==='function') renderBaithakInstants();
  else if(typeof renderLiveBaithakStories==='function') renderLiveBaithakStories();
  // B3: never fall through to SAMPLE_STORIES friend rings

  // B0/B1: signed-in never keeps guest SAMPLE peers; always re-assert pins for active uid
  if(currentUser){
    if(typeof clearBaithakSampleInbox==='function') clearBaithakSampleInbox();
    if(typeof baithakChats!=='undefined'){
      baithakChats=typeof pinSelfChat==='function'?pinSelfChat([]):[];
    }
    if(typeof ensureSelfChatDoc==='function') ensureSelfChatDoc().catch(()=>{});
    if(typeof ensureChaupaalChatDoc==='function') ensureChaupaalChatDoc().catch(()=>{});
  }

  if(typeof baithakChats!=='undefined') baithakChats = typeof pinSelfChat==='function' ? pinSelfChat(baithakChats) : baithakChats;
  if(typeof BaithakSearch!=='undefined'&&typeof BaithakSearch.wireChrome==='function') BaithakSearch.wireChrome();
  if(currentUser&&typeof loadBaithakPrefs==='function'){
    loadBaithakPrefs().catch(()=>{}).finally(()=>{
      if(typeof setBaithakSection==='function') setBaithakSection(typeof window.baithakSection==='function'?window.baithakSection():'sabha');
    });
  }
  if(currentUser&&typeof hydrateInboxFromDeviceCache==='function'){
    hydrateInboxFromDeviceCache();
    if(typeof clearBaithakSampleInbox==='function') clearBaithakSampleInbox();
  }
  if(!currentUser){
    // Guest list is render-only — Demo only on Sabha (B0/B2); never pollute baithakChats
    if(typeof clearBaithakSampleInbox==='function') clearBaithakSampleInbox();
    else if(typeof baithakChats!=='undefined') baithakChats=typeof pinSelfChat==='function'?pinSelfChat([]):[];
    if(typeof setBaithakSection==='function') setBaithakSection('sabha');
    else {
      const guest=typeof baithakGuestSabhaList==='function'?baithakGuestSabhaList():[];
      renderChatList(guest);
    }
    if(typeof mountBaithakFriendRequests==='function') mountBaithakFriendRequests();
    return;
  }
  if(typeof setBaithakSection==='function'){
    setBaithakSection('sabha');
  } else {
    renderChatList(typeof baithakChats!=='undefined'?baithakChats:(typeof pinSelfChat==='function'?pinSelfChat([]):[]));
  }
  if(typeof mountBaithakFriendRequests==='function') mountBaithakFriendRequests();
  startBaithakFriendRequestPoll();
  if(db&&currentUser&&typeof loadBaithakChatsPage==='function'){
    if(typeof loadBaithakNicknames==='function') loadBaithakNicknames().catch(()=>{});
    loadBaithakChatsPage({reset:true})
      .then(async ()=>{
        if(typeof clearBaithakSampleInbox==='function') clearBaithakSampleInbox();
        if(typeof migrateDuplicateDmInbox==='function'){
          try{ await migrateDuplicateDmInbox(currentUser.uid); }catch(e){}
        }
        if(typeof dedupeBaithakInbox==='function') dedupeBaithakInbox();
        if(typeof baithakChats!=='undefined') baithakChats = pinSelfChat(baithakChats);
        if(typeof assertBaithakDmIntegrity==='function'&&Array.isArray(baithakChats)){
          const report=assertBaithakDmIntegrity(baithakChats,{viewerUid:currentUser.uid});
          if(!report.ok) console.warn('[baithak] dm integrity after load', report);
        }
        if(typeof setBaithakSection==='function') setBaithakSection('sabha');
        else renderChatList(baithakChats);
        if(typeof mountBaithakFriendRequests==='function') mountBaithakFriendRequests();
        if(typeof baithakMsgCache?.prefetchTop==='function'&&Array.isArray(baithakChats)){
          baithakMsgCache.prefetchTop(baithakChats.slice(0,5).map((c)=>c.firestoreId||c.id)).catch(()=>{});
        }
      })
      .catch(()=>{
        if(typeof baithakChatLoadError!=='undefined') baithakChatLoadError=true;
        if(typeof clearBaithakSampleInbox==='function') clearBaithakSampleInbox();
        // Keep last real cache / pins — never inject SAMPLE for signed-in
        renderChatList(typeof baithakChats!=='undefined'?pinSelfChat(baithakChats):(typeof pinSelfChat==='function'?pinSelfChat([]):[]));
      });
  }
}

/** B0/B1: guest→auth / account switch — wipe Demo, rebuild pins for active uid. */
document.addEventListener('chaupaal:auth', () => {
  try {
    if (typeof clearBaithakSampleInbox === 'function') clearBaithakSampleInbox();
  } catch (e) {}
  try {
    if (typeof baithakChats !== 'undefined') {
      baithakChats = typeof pinSelfChat === 'function' ? pinSelfChat([]) : [];
    }
  } catch (e) {}
  try {
    if (typeof renderChatList === 'function') {
      const next =
        typeof baithakChats !== 'undefined'
          ? typeof pinSelfChat === 'function'
            ? pinSelfChat(baithakChats)
            : baithakChats
          : typeof pinSelfChat === 'function'
            ? pinSelfChat([])
            : [];
      renderChatList(next);
    }
  } catch (e) {}
  try {
    if (typeof ensureSelfChatDoc === 'function') ensureSelfChatDoc().catch(() => {});
    if (typeof ensureChaupaalChatDoc === 'function') ensureChaupaalChatDoc().catch(() => {});
  } catch (e) {}
  try {
    if (typeof renderBaithakInstants === 'function') renderBaithakInstants();
  } catch (e) {}
});

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
      if(q.format === 'binary') options = /* i18n-copy */ [t('baithak.yes'), t('baithak.no')];
      while(options.length < 2) options.push(t('baithak.option_n', { n: options.length + 1 }));
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
      text:tEn('chat.auto.challenge_n', { count: engineQs.length }),
      attachment:{
        type:'muqabala_challenge',
        challengeId,
        questions: engineQs,
        timerSeconds,
        label:tEn('chat.auto.challenge_label', { count: engineQs.length, seconds: timerSeconds }),
      },
      time:'now',
      pending:true,
    }, chat.type==='group');
    if(typeof sendRealtimeMessage==='function'){
      sendRealtimeMessage(
        chat.firestoreId||chat.id,
        tEn('chat.auto.challenge_n', { count: engineQs.length }),
        chat.type==='group',
        null,
        {
          type:'muqabala_challenge',
          challengeId,
          questions: engineQs,
          timerSeconds,
          label:tEn('chat.auto.challenge_label_for', { count: engineQs.length, seconds: timerSeconds, name: chat.name }),
        }
      );
    }
    return challengeId;
  }

  function launchEngine(engineQs, source){
    if(typeof startMuqabala !== 'function'){
      showToast(t('baithak.muqabala_engine_not_ready'));
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
        <div class="challenge-creator-title">${tHtml('baithak.create_challenge')}</div>
        <button id="closeCreator" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>
      <div class="challenge-creator-body">
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">${tHtml('baithak.content_source')}</div>
        <div class="q-count-row" style="margin-bottom:14px;">
          <button class="q-count-chip ${contentSource==='manual'?'active':''}" data-src="manual" type="button">${tHtml('baithak.manual')}</button>
          <button class="q-count-chip ${contentSource==='ai'?'active':''}" data-src="ai" type="button" ${aiComingSoon?'disabled aria-disabled="true" title="' + tHtml('baithak.ai_quiz_not_available_yet') + '"':''}>${tHtml('baithak.ai_source')} ${aiComingSoon?tHtml('baithak.not_available'):''}</button>
        </div>

        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">${tHtml('baithak.timer_per_question')}</div>
        <div class="q-count-row" style="margin-bottom:14px;">
          ${timerOpts.map(s=>`<button class="q-count-chip ${timerSeconds===s?'active':''}" data-timer="${s}" type="button">${s}s</button>`).join('')}
        </div>

        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">${tHtml('baithak.how_many_questions')}</div>
        <div class="q-count-row">
          ${/* i18n-values: baithak.q_count */ [3,5,'Custom'].map(n=>`<button class="q-count-chip ${qCount===n?'active':''}" data-n="${n}" type="button">${n==='Custom'?tHtml('baithak.custom'):n}</button>`).join('')}
        </div>

        ${contentSource==='ai' ? `
          <div style="margin:14px 0;padding:12px;background:var(--cream);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.45;">
            ${aiComingSoon
              ? tHtml('baithak.ai_quiz_generation_isn_t_available')
              : (aiBusy ? tHtml('baithak.generating_questions') : tHtml('baithak.generate_mcqs_with_ai_then_send'))}
          </div>
          ${!aiComingSoon ? `<button class="add-q-btn" id="aiGenBtn" type="button" ${aiBusy?'disabled':''}>${tHtml('baithak.generate_with_ai')}</button>` : ''}
        ` : `
          <div id="questionsContainer">
            ${questions.map((q,i) => renderQuestionBuilder(q,i)).join('')}
          </div>
          <button class="add-q-btn" id="addQBtn" type="button">${tHtml('baithak.add_another_question')}</button>
        `}

        <button class="btn btn--primary btn--block btn--lg send-challenge-btn" id="sendChallengeBtn" type="button">${tHtml('baithak.send_and_play_vs', { name: bidi(chat.name || t('common.friend')) })}</button>
      </div>
    `;

    creator.querySelectorAll('[data-src]').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const src = chip.dataset.src;
        if(src === 'ai' && aiComingSoon){
          showToast(t('baithak.ai_quiz_isn_t_available_yet'));
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
                  title: t('baithak.how_many_questions'),
                  placeholder: '1–20',
                  confirmLabel: t('baithak.set'),
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
        showToast(t('baithak.ai_quiz_isn_t_available_yet'));
        return;
      }
      aiBusy = true;
      render();
      const gen = typeof generateMuqabalaQuestionsAI === 'function'
        ? await generateMuqabalaQuestionsAI({ category: 'GK', count: typeof qCount === 'number' ? qCount : 5 })
        : null;
      aiBusy = false;
      if(!gen || !gen.length){
        showToast(t('baithak.could_not_generate_questions_try_manual'));
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
      showToast(t('baithak.generated_questionscount_questions_review', { questionsCount: questions.length }));
      render();
    });

    document.getElementById('sendChallengeBtn')?.addEventListener('click',()=>{
      syncFromDom();
      const engineQs = toEngineQuestions(questions);
      if(!engineQs.length){
        showToast(t('baithak.add_at_least_one_question_with'));
        return;
      }
      const incomplete = engineQs.some(q=>q.options.length < 2);
      if(incomplete){
        showToast(t('baithak.each_question_needs_at_least_2'));
        return;
      }
      const source = fromAi ? 'ai' : 'manual';
      // Friend challenges are unlimited — no daily credit.
      postChallengeBubble(engineQs, source);
      closeCreator();
      showToast(t('baithak_challenge_sent',{name:bidi(chat.name)}));
      launchEngine(engineQs, source);
    });

    creator.querySelectorAll('.format-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        syncFromDom();
        const qi = parseInt(chip.dataset.qi, 10);
        const fmt = chip.dataset.fmt;
        if(questions[qi]){
          questions[qi].format = fmt;
          if(fmt === 'binary') questions[qi].options = /* i18n-copy */ [t('baithak.yes'), t('baithak.no')];
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
      mcq: `${['A','B','C','D'].map((l,oi)=>`<div style="display:flex;align-items:center;gap:6px;"><input class="challenge-opt-input" placeholder="${l}..." value="${(q.options[oi]||'').replace(/"/g,'&quot;')}"><label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="radio" name="correct_${i}" ${q.correct===oi?'checked':''} style="accent-color:var(--red);"> ${tHtml('baithak.correct')}</label></div>`).join('')}`,
      binary: `${/* i18n-copy */ [t('baithak.yes'),t('baithak.no')].map((l,oi)=>`<div style="display:flex;align-items:center;gap:6px;"><input class="challenge-opt-input" value="${l}" readonly><label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="radio" name="correct_${i}" ${q.correct===oi?'checked':''} style="accent-color:var(--red);"> ${tHtml('baithak.correct')}</label></div>`).join('')}`,
      dropdown: `${/* i18n-copy */ [t('baithak.option_a'),t('baithak.option_b'),t('baithak.option_c')].map((l,oi)=>`<input class="challenge-opt-input" placeholder="${l}" value="${(q.options[oi]||'').replace(/"/g,'&quot;')}">`).join('')}`,
    }[q.format] || '';
    return `
      <div class="challenge-q-card">
        <div class="challenge-q-num">${tHtml('baithak.question_n', { n: i + 1 })}</div>
        <textarea class="challenge-q-input" placeholder="${tHtml('baithak.write_your_question')}" rows="2" data-qi="${i}">${q.text||''}</textarea>
        <div class="format-row">
          ${[{k:'mcq',l:t('baithak.format_mcq')},{k:'binary',l:t('baithak.format_yes_no')},{k:'dropdown',l:t('baithak.format_dropdown')}].map(f=>`<button class="format-chip ${q.format===f.k?'active':''}" data-qi="${i}" data-fmt="${f.k}" type="button">${f.l}</button>`).join('')}
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
    else if(typeof showToast==='function') showToast(t('baithak.sign_in_to_message_people'));
    return;
  }
  const sheet=document.createElement('div');
  sheet.className='new-dm-sheet';
  sheet.style.cssText='position:absolute;inset:0;background:var(--cream);z-index:100;display:flex;flex-direction:column;';
  sheet.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;padding:16px;background:var(--white);border-bottom:1px solid var(--line);">
      ${typeof backButtonHtml==='function'?backButtonHtml({ id: 'closeNewDm' }):'<button type="button" id="closeNewDm" class="cp-back-btn" aria-label="' + tHtml('common.back') + '">←</button>'}
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;flex:1;">${tHtml('baithak.start_a_new_conversation')}</div>
    </div>
    <div style="padding:12px 16px;">
      <input id="newDmSearch" type="search" autocomplete="off" placeholder="${tHtml('baithak.search_by_name_or_username')}"
        style="width:100%;padding:12px 14px;border:2px solid var(--line);border-radius:14px;font-size:15px;box-sizing:border-box;outline:none;">
      <button type="button" class="btn" id="newDmContactsBtn" style="margin-top:10px;width:100%;">${tHtml('baithak.find_from_contacts')}</button>
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
    results.innerHTML=`<div class="contacts-fallback">${typeof t==='function'?t('contacts_soft_prompt'):tHtml('baithak.optional_find_friends_already_on_chaupaal')}</div>`;
  } else if(opts&&opts.withContacts&&typeof loadContactsInto==='function'){
    loadContactsInto(results);
  }
  let timer=null;
  async function runSearch(q){
    results.innerHTML='<div style="padding:16px;color:var(--muted);font-size:13px;">' + tHtml('baithak.searching') + '</div>';
    try{
      const rows=typeof searchUsersProvider==='function'
        ? await searchUsersProvider(q,{limit:20})
        : [];
      if(!rows.length){
        results.innerHTML='<div style="padding:16px;color:var(--muted);font-size:13px;">' + tHtml('baithak.no_people_found') + '</div>';
        return;
      }
      results.innerHTML=rows.map(r=>`
        <button type="button" class="new-dm-row" data-uid="${r.uid||''}" data-name="${(r.name||r.username||'').replace(/"/g,'&quot;')}" data-avatar="${(r.avatar||'👤').replace(/"/g,'&quot;')}"
          style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;border:0;border-bottom:1px solid var(--line);background:transparent;cursor:pointer;text-align:left;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--white);display:grid;place-items:center;overflow:hidden;">${r.photoURL?`<img src="${r.photoURL}" style="width:100%;height:100%;object-fit:cover;">`:'👤'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">${baithakEsc(r.name||r.username||t('common.user'))}</div>
            <div style="font-size:12px;color:var(--muted);">@${r.username||'user'}</div>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--red);">${tHtml('baithak.msg_actions')}</span>
        </button>`).join('');
      results.querySelectorAll('.new-dm-row').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          const uid=btn.dataset.uid;
          if(!uid) return;
          if(uid===currentUser?.uid){
            if(typeof showToast==='function') showToast(t('baithak.that_s_you'));
            return;
          }
          if(typeof dismissedUids!=='undefined'&&dismissedUids instanceof Set&&dismissedUids.has(uid)){
            if(typeof showToast==='function') showToast(t('baithak.you_ve_blocked_this_person'));
            return;
          }
          close();
          if(typeof openDmWithSharedHello==='function'){
            await openDmWithSharedHello({
              uid,
              name:btn.dataset.name||t('common.friend'),
              avatar:btn.dataset.avatar||'👤',
              starterText:t('common.starter_hi'),
              origin:'new_dm',
            });
          }
        });
      });
    }catch(e){
      results.innerHTML='<div style="padding:16px;color:var(--red);font-size:13px;">' + tHtml('baithak.search_failed_try_again') + '</div>';
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
    <button type="button" class="btn btn--block" data-new="dm" style="margin-bottom:8px;text-align:left;">${tHtml('baithak.start_a_new_conversation_2')}</button>
    <button type="button" class="btn btn--block" data-new="group" style="margin-bottom:8px;text-align:left;">${tHtml('baithak.gather_a_group')}</button>`;
  if(typeof openHalfSheet==='function'){
    openHalfSheet({
      id:'baithakNewChatSheet',
      title: typeof t==='function' ? (t('baithak_menu_new_chat')||t('baithak.menu_new_chat')) : t('baithak.menu_new_chat'),
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
  sheet.innerHTML=`<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:17px;margin-bottom:14px;">${tHtml('baithak.menu_new_chat')}</div>${bodyHtml}
    <button id="closeSheet2" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">${tHtml('common.cancel')}</button>`;
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
      ${typeof backButtonHtml==='function'?backButtonHtml({ id: 'closeGrp' }):'<button type="button" id="closeGrp" class="cp-back-btn" aria-label="' + tHtml('common.back') + '">←</button>'}
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;">${tHtml('baithak.menu_new_group')}</div>
    </div>
    <input class="auth-input" placeholder="${tHtml('baithak.group_name')}" id="grpName">
    <input class="auth-input" placeholder="${tHtml('baithak.description_optional')}" id="grpDesc">
    <div style="font-size:13px;font-weight:700;margin:14px 0 8px;">${typeof t==='function'?t('group_visibility'):tHtml('baithak.group_visibility')}</div>
    <div class="group-vis-seg" role="radiogroup" data-create-vis>
      <button type="button" class="group-vis-opt is-selected" data-vis="private" role="radio" aria-checked="true">${typeof t==='function'?t('group_vis_private'):tHtml('baithak.group_vis_private')}</button>
      <button type="button" class="group-vis-opt" data-vis="discoverable" role="radio">${typeof t==='function'?t('group_vis_discoverable'):tHtml('baithak.group_discoverable')}</button>
      <button type="button" class="group-vis-opt" data-vis="public" role="radio">${typeof t==='function'?t('group_vis_public'):tHtml('baithak.group_vis_public')}</button>
    </div>
    <div class="group-vis-hint" data-create-vis-hint style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.45;">${typeof t==='function'?t('group_vis_private_hint'):tHtml('baithak.group_vis_private_hint')}</div>
    <div style="font-size:13px;color:var(--muted);margin:12px 0 8px;line-height:1.45;">${tHtml('baithak.after_you_create_the_group_you')}</div>
    <button style="margin-top:auto;width:100%;padding:15px;background:var(--red);color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;" id="createGrpBtn">${tHtml('baithak.create_group')}</button>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closeGrp').addEventListener('click',()=>sheet.remove());
  if(typeof pushNavLayer==='function'){
    sheet.dataset.navManaged='1';
    pushNavLayer(sheet,()=>sheet.remove());
  }
  let vis='private';
  const hints={
    private: typeof t==='function'?t('group_vis_private_hint'):t('baithak.group_vis_private_hint'),
    discoverable: typeof t==='function'?t('group_vis_discoverable_hint'):t('baithak.appears_in_search_request_to_join'),
    public: typeof t==='function'?t('group_vis_public_hint'):t('baithak.group_vis_public_hint'),
  };
  sheet.querySelectorAll('[data-vis]').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      vis=btn.dataset.vis||'private';
      sheet.querySelectorAll('[data-vis]').forEach((b)=>{
        b.classList.toggle('is-selected',b===btn);
        b.setAttribute('aria-checked',b===btn?'true':'false');
      });
      const h=sheet.querySelector('[data-create-vis-hint]');
      if(h) h.textContent=hints[vis]||hints.private;
    });
  });
  document.getElementById('createGrpBtn').addEventListener('click',async()=>{
    const name=document.getElementById('grpName').value.trim();
    if(!name){showToast(t('baithak_enter_group'));return;}
    const desc=document.getElementById('grpDesc')?.value?.trim()||'';
    sheet.remove();
    if(typeof createGroupInFirestore==='function'){
      const chat=await createGroupInFirestore({name,description:desc,visibility:vis});
      if(chat){
        showToast(t('baithak_group_created',{name: bidi(name)}));
        if(typeof openChatScreen==='function') openChatScreen(chat);
      }
    } else showToast(t('baithak_group_created',{name: bidi(name)}));
  });
}

// ===================== MONTHLY/YEARLY WRAP =====================
// Monthly wrap lives in streak.js (buildWrapData + showMonthlyWrap). Do not redefine here.
function showYearlyWrap(){
  const now=new Date();
  const isUnlocked=(now.getMonth()===11&&now.getDate()>=25)||now.getMonth()===0;
  if(!isUnlocked){showToast(t('baithak.yearly_wrap_unlocks_on_december_25th'));return;}
  const d=buildWrapData();
  const year=now.getFullYear()-(now.getMonth()===0?1:0);
  const totalSessions=JSON.parse(localStorage.getItem('chaupaal_play_history')||'[]').length;
  const wrap=document.createElement('div');wrap.className='wrap-overlay';
  const pages=[
    {bg:'linear-gradient(160deg,#0F0C29,#302B63,#24243e)',content:`<div style="font-size:56px;margin-bottom:16px;">✨</div><div class="wrap-label" style="color:rgba(255,255,255,0.6);">${year} on Chaupaal</div><div class="wrap-headline" style="color:#fff;">${tHtml('baithak.your_year_in_review')}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.6);">${tHtml('baithak.tap_to_explore')}</div>`},
    {bg:'linear-gradient(160deg,#E63946,#C72E3A)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">${tHtml('baithak.you_showed_up')}</div><div class="wrap-big-num" style="color:#fff;">${totalSessions}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${tHtml('baithak.days_you_played_akhbaar_this_year')}</div>`},
    {bg:'linear-gradient(160deg,var(--navy),#2A3158)',content:`<div class="wrap-label" style="color:var(--gold);">${tHtml('baithak.your_biggest_obsession')}</div><div style="font-size:64px;margin:8px 0;">${CATEGORY_ICONS[d.topCat]||'🏆'}</div><div class="wrap-headline" style="color:#fff;">${d.topCat}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">${tHtml('baithak.you_dominated_this_all_year')}</div>`},
    {bg:'linear-gradient(160deg,#2A9D8F,#1A6B64)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">${tHtml('baithak.accuracy')}</div><div class="wrap-big-num" style="color:#fff;">${d.accuracy}%</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${d.totalCorrect} correct out of ${d.totalQ}</div>`},
    {bg:'linear-gradient(160deg,#FF9A3C,#E63946)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">${tHtml('baithak.longest_streak')}</div><div class="wrap-big-num" style="color:#fff;">🔥 ${d.streak}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${tHtml('baithak.consecutive_days_this_year')}</div>`},
    {bg:'linear-gradient(160deg,#8134AF,#515BD4)',content:`<div class="wrap-label" style="color:rgba(255,255,255,0.7);">${tHtml('baithak.your_personality')}</div><div style="font-size:48px;margin:12px 0;">${personalityProfile.lifestyle==='outdoorsy'?'🌿':personalityProfile.lifestyle==='intellectual'?'📚':personalityProfile.lifestyle==='cinephile'?'🎬':'🧭'}</div><div class="wrap-headline" style="color:#fff;font-size:28px;">${personalityProfile.lifestyle?personalityProfile.lifestyle.charAt(0).toUpperCase()+personalityProfile.lifestyle.slice(1):tHtml('baithak.curious_explorer')}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.7);">${tHtml('baithak.from_your_aur_sunao_answers_daily')}</div>`},
    {bg:'linear-gradient(160deg,#C9A227,#B7791F)',content:`<div style="font-size:56px;margin-bottom:16px;">🥂</div><div class="wrap-headline" style="color:#fff;">${tHtml('baithak.wrap_heres_to', { year: year + 1 })}</div><div class="wrap-sub" style="color:rgba(255,255,255,0.8);">${tHtml('baithak.keep_reading_keep_playing_the_chaupaal')}</div><button class="wrap-share-btn" id="wrapYearShare">${tHtml('baithak.wrap_share_year', { year })}</button>`},
  ];
  let idx=0;
  function renderPage(){
    const p=pages[idx];
    wrap.innerHTML=`<div class="wrap-page" style="background:${p.bg};">${p.content}<button class="wrap-close" onclick="this.closest('.wrap-overlay').remove()">✕</button></div>`;
    wrap.querySelector('#wrapYearShare')?.addEventListener('click',()=>{
      const wrapStats=typeof buildShareStats==='function'
        ? buildShareStats({
            scoreLine:`${d.accuracy}%`,
            meta:t('baithak.totalsessions_days_streak_day_streak_topca', { totalSessions, streak: d.streak, topCat: d.topCat }),
            text:t('baithak.my_year_chaupaal_wrap_totalsessions_days', { year, totalSessions, accuracy: d.accuracy, streak: d.streak, topCat: d.topCat }),
          })
        : {scoreLine:`${d.accuracy}%`,meta:`${year}`,text:t('baithak.my_year_chaupaal_wrap', { year })};
      if(typeof openUnifiedShareSheet==='function'){
        openUnifiedShareSheet({gameId:'wrap',title:t('baithak.share_year_wrap', { year }),subtitle:t('baithak.your_year_on_chaupaal'),stats:wrapStats});
      } else {
        const text=t('baithak.my_year_chaupaal_wrap_totalsessions_days_2', { year, totalSessions, accuracy: d.accuracy, streak: d.streak, topCat: d.topCat });
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
window.startBaithakFriendRequestPoll=startBaithakFriendRequestPoll;
window.stopBaithakFriendRequestPoll=stopBaithakFriendRequestPoll;
