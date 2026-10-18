// ===================== AKHBAAR (Reel questions) =====================
const observer=new IntersectionObserver(entries=>{
  entries.forEach(e=>e.target.classList.toggle('active',e.intersectionRatio>0.6));
},{root:document.getElementById('reelStage'),threshold:[0,0.6,1]});

let _akhbaarBuilt=false;
let _akhbaarBuilding=null;
let _akhbaarScrollWired=false;
let _akhbaarUpdateProgress=null;

function akhbaarIsLiveSet(){
  return window.akhbaarLiveSet===true;
}
function akhbaarIsSampleContent(data){
  return !!(data&&(data.isSample||data.isDemo||!akhbaarIsLiveSet()));
}
function applyAkhbaarTruthBadge(){
  const panel=document.getElementById('panel-akhbaar');
  if(!panel) return;
  let badge=document.getElementById('akhbaarTruthBadge');
  if(akhbaarIsLiveSet()){
    badge?.remove();
    panel.classList.remove('akhbaar--sample');
    return;
  }
  panel.classList.add('akhbaar--sample');
  if(!badge){
    badge=document.createElement('div');
    badge.id='akhbaarTruthBadge';
    badge.className='akhbaar-truth-badge';
    badge.setAttribute('role','status');
    const progress=document.getElementById('progressBar');
    if(progress?.parentElement) progress.parentElement.insertBefore(badge, progress.nextSibling);
    else panel.prepend(badge);
  }
  const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
  badge.textContent=offline?t('akhbaar.offline_practice'):t('akhbaar.sample');
  badge.title=offline
    ?t('akhbaar.practice_bank_not_today_s_live')
    :t('akhbaar.sample_practice_questions_not_today_s');
}

function _akhbaarYield(){
  return new Promise(resolve=>{
    if(typeof requestIdleCallback==='function'){
      requestIdleCallback(()=>resolve(),{timeout:48});
    } else {
      requestAnimationFrame(()=>resolve());
    }
  });
}

function _resolveAkhbaarQuestionSet(qs,bonus){
  let questions=Array.isArray(qs)?qs.slice():[];
  let bonusQs=Array.isArray(bonus)?bonus.slice():[];
  let usedSampleBank=false;
  if(!questions.length){
    const offline=[
      ...(typeof SAMPLE_QUESTIONS!=='undefined'?SAMPLE_QUESTIONS:[]),
      ...(typeof AKHBAAR_BANK!=='undefined'?AKHBAAR_BANK:[]),
    ];
    questions=offline.slice().sort(()=>Math.random()-0.5).map((q)=>({...q,isSample:true,isDemo:true}));
    usedSampleBank=true;
    window.akhbaarLiveSet=false;
    if(typeof QUESTIONS!=='undefined') QUESTIONS=questions;
  } else if(window.akhbaarLiveSet!==true){
    // Boot assigned offline bank — keep Sample flags
    questions=questions.map((q)=>(q.isSample||q.isDemo)?q:{...q,isSample:true,isDemo:true});
    usedSampleBank=true;
  }
  // Signed-in: never present SAMPLE personal (Riya / fake streak) as live news
  const signedIn=typeof currentUser!=='undefined'&&!!currentUser;
  if(signedIn&&(usedSampleBank||!akhbaarIsLiveSet())){
    questions=questions.filter((q)=>!q.personal);
  }
  if(!bonusQs.length&&typeof SAMPLE_BONUS!=='undefined'){
    bonusQs=SAMPLE_BONUS.map((q)=>({...q,isSample:true,isDemo:true}));
    window.akhbaarBonusLive=false;
    if(typeof BONUS_QUESTIONS!=='undefined') BONUS_QUESTIONS=bonusQs;
  } else if(bonusQs.length&&window.akhbaarBonusLive!==true){
    bonusQs=bonusQs.map((q)=>(q.isSample||q.isDemo)?q:{...q,isSample:true,isDemo:true});
  }
  return {questions,bonusQs};
}

/** Lazy + chunked reel DOM — keep off Peepal LCP path. */
async function buildAkhbaar(QUESTIONS_IN,BONUS_QUESTIONS_IN){
  const {questions:QUESTIONS,bonusQs:BONUS_QUESTIONS}=_resolveAkhbaarQuestionSet(QUESTIONS_IN,BONUS_QUESTIONS_IN);
  const stage=document.getElementById('reelStage');
  if(!stage||!QUESTIONS.length) return;
  stage.innerHTML='';score=0;maxUnlocked=0;categoryScores={};
  applyAkhbaarTruthBadge();

  const pb=document.getElementById('progressBar');
  if(pb){
    pb.innerHTML='';
    const frag=document.createDocumentFragment();
    QUESTIONS.forEach((_,i)=>{const s=document.createElement('div');s.className='seg';s.dataset.i=i;frag.appendChild(s);});
    pb.appendChild(frag);
  }

  function updateProgress(){
    pb?.querySelectorAll('.seg').forEach((s,i)=>{s.classList.toggle('fill',i<maxUnlocked);});
  }
  _akhbaarUpdateProgress=updateProgress;

  const appendQuestionCard=(data,idx,onProgress)=>{
    const card=document.createElement('div');card.className='reel-card';
    if(akhbaarIsSampleContent(data)) card.dataset.sample='1';
    const inner=document.createElement('div');inner.className='card-inner';inner.id=`inner-${idx}`;
    card.appendChild(inner);stage.appendChild(card);
    renderQuestion(inner,data,idx,onProgress);
    observer.observe(inner);
  };

  for(let idx=0;idx<QUESTIONS.length;idx++){
    appendQuestionCard(QUESTIONS[idx],idx,updateProgress);
    if(idx%2===1) await _akhbaarYield();
  }

  const resultsBrand=akhbaarIsLiveSet()
    ?t('akhbaar.chaupaal_aaj_ka_akhbaar')
    :t('akhbaar.chaupaal_sample_practice');
  const resultsCard=document.createElement('div');resultsCard.className='reel-card';
  const rc=document.createElement('div');rc.className='results-card';rc.id='resultsCard';
  rc.innerHTML=`
    <div class="results-brand"><span class="cp-mark cp-mark--sm" aria-hidden="true"><img src="/brand/chaupaal-mark-charpai-v2as.png" alt="" width="20" height="20"></span> ${resultsBrand}<span class="results-date" id="resultsDate"></span></div>
    <div class="score-big" id="scoreBig">0<span>/${QUESTIONS.length}</span></div>
    <div class="score-label">${tHtml('akhbaar.questions_answered_correctly')}</div>
    <div class="breakdown" id="breakdown"></div>
    <div class="streak-row"><div class="streak-pill-big">🔥 <span id="streakBig">—</span>${akhbaarIsLiveSet()&&typeof currentUser!=='undefined'&&currentUser?tHtml('akhbaar.day_streak_2'):tHtml('akhbaar.practice')}</div><div class="badge-pill" id="badgePill">${tHtml('akhbaar.badge')}</div></div>
    <div class="akhbaar-share-mount" id="akhbaarShareMount"></div>
  `;
  resultsCard.appendChild(rc);stage.appendChild(resultsCard);
  observer.observe(rc);
  await _akhbaarYield();

  const asCard=document.createElement('div');asCard.className='reel-card';
  const asInner=document.createElement('div');asInner.className='aur-sunao-card';
  const asQ=AUR_SUNAO_QUESTIONS[Math.floor(Math.random()*AUR_SUNAO_QUESTIONS.length)];
  asInner.innerHTML=`
    <div class="aur-sunao-label">${tHtml('akhbaar.aur_sunao')}</div>
    <div class="aur-sunao-q">${asQ.q}</div>
    <div class="aur-sunao-opts">${asQ.options.map((o,i)=>`<button class="as-opt" data-i="${i}">${o}</button>`).join('')}</div>
    <div class="hint show" style="color:rgba(255,255,255,0.4);margin-top:14px;">${tHtml('akhbaar.optional_helps_personalize_later')}</div>
  `;
  asCard.appendChild(asInner);stage.appendChild(asCard);
  asInner.querySelectorAll('.as-opt').forEach(btn=>btn.addEventListener('click',()=>{
    asInner.querySelectorAll('.as-opt').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    showToast(t('akhbaar.thanks_noted'));
  }));
  observer.observe(asInner);

  if(BONUS_QUESTIONS.length){
    const bonusIntro=document.createElement('div');bonusIntro.className='reel-card';
    const bi=document.createElement('div');bi.className='card-inner';bi.style.cssText='align-items:center;justify-content:center;text-align:center;gap:10px;';
    const bonusLabel=window.akhbaarBonusLive===true?t('akhbaar.aur_khabar'):t('akhbaar.aur_khabar_sample');
    bi.innerHTML=`<div style="font-size:36px;">🎁</div><div class="q-text" data-akhbaar-meta style="margin:0;">${bonusLabel}</div><div style="font-size:13px;color:var(--muted);">${tHtml('akhbaar.bonus_questions_streak_par_asar_nahi')}</div>`;
    bonusIntro.appendChild(bi);stage.appendChild(bonusIntro);observer.observe(bi);
    for(let i=0;i<BONUS_QUESTIONS.length;i++){
      const idx=QUESTIONS.length+1+i;
      appendQuestionCard(BONUS_QUESTIONS[i],idx,()=>{});
      if(i%2===1) await _akhbaarYield();
    }
  }

  if(!_akhbaarScrollWired){
    _akhbaarScrollWired=true;
    let isSnapping=false;
    stage.addEventListener('scroll',()=>{
      if(isSnapping)return;
      const idx=Math.round(stage.scrollTop/stage.clientHeight);
      if(idx>maxUnlocked&&idx<QUESTIONS.length){
        isSnapping=true;stage.scrollTo({top:maxUnlocked*stage.clientHeight,behavior:'smooth'});
        setTimeout(()=>isSnapping=false,400);return;
      }
      if(typeof _akhbaarUpdateProgress==='function') _akhbaarUpdateProgress();
    });
  }

  if(typeof applyAkhbaarBeatBanner==='function') applyAkhbaarBeatBanner();

  // Breaking toast only for live set cards — never SAMPLE bonus `breaking:true`
  setTimeout(()=>{
    const onAkhbaar=document.getElementById('panel-akhbaar')?.classList.contains('active');
    if(!onAkhbaar||!akhbaarIsLiveSet()) return;
    const tags=stage.querySelectorAll('[data-breaking="1"]');
    if(!tags.length) return;
    tags.forEach(tag=>{tag.classList.remove('hidden');});
    if(typeof showToast==='function') showToast(t('akhbaar.a_taaza_khabar_just_dropped'));
  },6000);

  _akhbaarBuilt=true;
}

/**
 * Build reel when needed (first Akhbaar open or idle prefetch).
 * Safe to call repeatedly.
 */
function ensureAkhbaarBuilt(){
  if(_akhbaarBuilt) return Promise.resolve();
  if(_akhbaarBuilding) return _akhbaarBuilding;
  _akhbaarBuilding=(async()=>{
    try{
      const empty=!(typeof QUESTIONS!=='undefined'&&QUESTIONS.length);
      if(empty&&window.chaupaalAkhbaarContentReady){
        await Promise.race([
          window.chaupaalAkhbaarContentReady,
          new Promise(r=>setTimeout(r,1200)),
        ]);
      }
      const qs=typeof QUESTIONS!=='undefined'?QUESTIONS:[];
      const bonus=typeof BONUS_QUESTIONS!=='undefined'?BONUS_QUESTIONS:[];
      await buildAkhbaar(qs,bonus);
    }catch(e){
      console.warn('[akhbaar] build failed',e);
      _akhbaarBuilt=false;
    }
  })().finally(()=>{_akhbaarBuilding=null;});
  return _akhbaarBuilding;
}
window.ensureAkhbaarBuilt=ensureAkhbaarBuilt;

async function refreshAkhbaar(){
  if(_akhbaarBuilding) return _akhbaarBuilding;
  _akhbaarBuilt=false;
  return ensureAkhbaarBuilt();
}
window.refreshAkhbaar=refreshAkhbaar;

/** Beat-my-score banner for `/challenge/akhbaar?name=&score=` — score challenge, not a live Muqabala room. */
function applyAkhbaarBeatBanner(){
  const pending=window.__akhbaarBeatChallenge;
  if(!pending||!pending.challenger) return;
  document.getElementById('akhbaarBeatBanner')?.remove();
  const panel=document.getElementById('panel-akhbaar')||document.getElementById('reelStage')?.parentElement;
  if(!panel) return;
  const banner=document.createElement('div');
  banner.id='akhbaarBeatBanner';
  banner.className='akhbaar-beat-banner';
  const scoreBit=pending.score!=null?String(pending.score):t('akhbaar.their_score');
  banner.innerHTML=`
    <div class="akhbaar-beat-copy">
      <strong>${tHtml('akhbaar.beat_shared_score', { name: bidi(pending.challenger) })}</strong>
      <span>${tHtml('akhbaar.beat_try', { score: { html: scoreBit } })}</span>
    </div>
    <button type="button" class="akhbaar-beat-dismiss" aria-label="${tHtml('common.dismiss')}">✕</button>`;
  const reel=document.getElementById('reelStage');
  if(reel&&reel.parentElement) reel.parentElement.insertBefore(banner, reel);
  else panel.prepend(banner);
  banner.querySelector('.akhbaar-beat-dismiss')?.addEventListener('click',()=>banner.remove());
}

function consumeAkhbaarBeatChallenge(){
  const pending=window.__akhbaarBeatChallenge||null;
  window.__akhbaarBeatChallenge=null;
  document.getElementById('akhbaarBeatBanner')?.remove();
  return pending;
}

function akhbaarEscAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

/** Category stays the stored English code (data-cat); the visible tag is its label. */
function akhbaarTagLabel(data,{ personal, breaking, sample }){
  if(personal) return tHtml('akhbaar.tag_personal');
  if(breaking) return tHtml('akhbaar.tag_breaking');
  const cat=data.category?optionLabelHtml('akhbaar.cat',data.category):tHtml('akhbaar.cat.news');
  return sample?tHtml('akhbaar.tag_sample',{ category:{ html:cat } }):cat;
}

function renderQuestion(inner,data,idx,updateProgress){
  const isPersonal=data.personal||false;
  const sample=akhbaarIsSampleContent(data);
  const liveBreaking=!!(data.breaking&&akhbaarIsLiveSet()&&!sample);
  const tagLabel=akhbaarTagLabel(data,{ personal:isPersonal, breaking:liveBreaking, sample });
  inner.innerHTML=`
    <div class="q-tag ${isPersonal?'personal':liveBreaking?'breaking':'news'}" data-cat="${akhbaarEscAttr(data.category||'News')}"${liveBreaking?' data-breaking="1"':''}>${tagLabel}</div>
    <div class="q-text">${data.q}</div>
    <div class="options">${data.options.map((o,i)=>`<button class="opt" data-i="${i}"><span>${o}</span><span class="mark"></span></button>`).join('')}</div>
    <div class="hint" id="hint-${idx}">${t('scroll_next')}</div>
    <div class="float-layer" id="floatLayer-${idx}"></div>
  `;

  const optBtns=inner.querySelectorAll('.opt');
  optBtns.forEach(btn=>btn.addEventListener('click',()=>{
    if(inner.dataset.answered)return;
    inner.dataset.answered='true';
    const chosen=parseInt(btn.dataset.i);
    const isCorrect=chosen===data.correct;
    inner.dataset.wasCorrect=isCorrect?'true':'false';

    optBtns.forEach(b=>b.disabled=true);
    optBtns.forEach((b,i)=>{
      if(i===data.correct){b.classList.add('correct');b.querySelector('.mark').textContent='✓';}
      else if(i===chosen){b.classList.add('wrong');b.querySelector('.mark').textContent='✕';}
      else b.classList.add('dim');
    });

    if(!quietMode){SoundLib.playFeedback(isCorrect,data.sound||'default');SoundLib.speak(isCorrect?t('correct'):t('wrong'));}

    // Floating emojis — skip Quiet + reduced-motion
    const layer=inner.querySelector(`#floatLayer-${idx}`);
    const reduceMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!quietMode&&!reduceMotion){
      let pool=[isCorrect?'😄':'😢'];
      if(data.sound==='cheer'&&isCorrect)pool=['🎉','🇮🇳','🙌','🔥'];
      if(isPersonal&&isCorrect)pool=['🎉','🎂','🎈','✨'];
      for(let k=0;k<7;k++){
        const e=document.createElement('div');e.className='float-emoji';e.textContent=pool[k%pool.length];
        e.style.left=(10+Math.random()*80)+'%';e.style.bottom=(Math.random()*30)+'px';e.style.animationDelay=(Math.random()*0.3)+'s';
        layer.appendChild(e);
      }
    }

    // Score tracking
    if(!categoryScores[data.category])categoryScores[data.category]={correct:0,total:0};
    categoryScores[data.category].total++;
    if(isCorrect){score++;categoryScores[data.category].correct++;}

    // A3: kick off real proof tally (live signed-in only) — display after N in summary
    if(akhbaarIsLiveSet()&&!isPersonal&&!sample&&typeof currentUser!=='undefined'&&currentUser){
      recordAkhbaarAnswerProof(data,idx,isCorrect).then((proof)=>{
        try{inner._akhbaarProof=proof;}catch(e){}
      }).catch(()=>{});
    }

    maxUnlocked=Math.max(maxUnlocked,idx+1);
    updateProgress();

    // Show news summary after delay
    setTimeout(()=>showNewsSummary(inner,data,idx),1400);
  }));
}

function showNewsSummary(inner,data,idx){
  const wasCorrect=inner.dataset.wasCorrect==='true';
  let sourceLine;
  if (data.personal) {
    sourceLine = `<div class="news-source">${t('source_personal')}</div>`;
  } else if (data.link) {
    const domain = (() => {
      try {
        return new URL(data.link).hostname.replace(/^www\./, '');
      } catch (e) {
        return data.link;
      }
    })();
    sourceLine = `<div class="news-source"><a href="${data.link}" target="_blank" rel="noopener" class="news-source-link">${tHtml('akhbaar.source_domain', { domain })} ↗</a></div>`;
  } else if (data.source) {
    sourceLine = `<div class="news-source">${tHtml('akhbaar.source_date', { source: data.source, date: typeof formatDate === 'function' ? formatDate(new Date()) : new Date().toDateString() })}</div>`;
  } else {
    sourceLine = `<div class="news-source">${t('source_news',{date:new Date().toDateString()})}</div>`;
  }
  const explainHtml=(!wasCorrect&&data.explain)?`<div class="explain-box">💡 <strong>${t('why')}</strong> ${data.explain}</div>`:'';
  const linkHtml=data.link?`<a class="news-link" href="${data.link}" target="_blank" rel="noopener">${t('read_more')}</a>`:'';
  const hintText=idx===QUESTIONS.length-1?t('scroll_recap'):t('scroll_next');
  const friendUid=data.friendUid||data.uid||data.authorUid||'';
  const friendName=data.friendName||data.authorName||data.user?.name||'';
  const isEvent = data.personal || data.eventType === 'birthday' || data.eventType === 'anniversary' || data.eventType === 'trip';
  const wishHtml=(isEvent&&friendUid)
    ?`<button type="button" class="btn btn--primary" data-akhbaar-wish style="margin-top:10px;width:100%;">${data.eventType === 'birthday' ? '🎂' : data.eventType === 'anniversary' ? '💍' : '✈️'} ${friendName ? tHtml('akhbaar.wish_name_on_baithak', { name: bidi(friendName) }) : tHtml('akhbaar.wish_them_on_baithak')}</button>`
    :'';
  const sample=akhbaarIsSampleContent(data);
  const tagLabel=akhbaarTagLabel(data,{ personal:!!data.personal, breaking:false, sample });
  const flagHtml=!data.personal
    ?`<div class="flag-row"><button type="button" class="flag-btn" data-akhbaar-flag>${tHtml('akhbaar.flag')}</button></div>`
    :'';
  const proofHtml=!data.personal
    ?`<div class="social-proof hidden" data-akhbaar-proof aria-live="polite"></div>`
    :'';
  inner.innerHTML=`
    <div class="q-tag ${data.personal?'personal':'news'}" data-cat="${akhbaarEscAttr(data.category||'News')}">${tagLabel}</div>
    <div class="news-summary">
      <div class="news-headline">${data.headline||tHtml('akhbaar.about_this_question')}</div>
      ${explainHtml}
      ${proofHtml}
      <div class="news-body">${data.news||tHtml('akhbaar.this_question_is_based_on_recent')}</div>
      ${linkHtml}${sourceLine}${wishHtml}${flagHtml}
      <div class="hint show">${hintText}</div>
    </div>
  `;
  fillAkhbaarProofSlot(inner,data,idx,wasCorrect);
  inner.querySelector('[data-akhbaar-wish]')?.addEventListener('click',()=>{
    if(typeof openBaithakWithWish==='function'){
      openBaithakWithWish({
        uid:friendUid,
        name:friendName||t('common.friend'),
        type:data.eventType||'generic',
      });
    } else if(typeof openBaithakWithPrefill==='function'){
      openBaithakWithPrefill({
        uid:friendUid,
        name:friendName||t('common.friend'),
        type:data.eventType||'friend_update',
      });
    }
  });
  inner.querySelector('[data-akhbaar-flag]')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(typeof openAkhbaarFlagSheet==='function') openAkhbaarFlagSheet(data,{idx});
    else if(typeof showToast==='function') showToast(t('akhbaar.reporting_unavailable'));
  });
  // populate results if last question
  if(idx===QUESTIONS.length-1)setTimeout(()=>populateResults(),200);
}

function populateResults(){
  document.getElementById('scoreBig').innerHTML=`${score}<span>/${QUESTIONS.length}</span>`;
  document.getElementById('resultsDate').textContent=(typeof formatDate==='function'?formatDate(new Date(),'dayMonth'):new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'}));
  // Update right panel
  const rpScore=document.getElementById('rpYourScore');
  if(rpScore)rpScore.textContent=`${score}/${QUESTIONS.length}`;
  const bd=document.getElementById('breakdown');if(!bd)return;bd.innerHTML='';
  Object.entries(categoryScores).forEach(([cat,v])=>{
    const pct=Math.round((v.correct/v.total)*100);
    const row=document.createElement('div');row.className='breakdown-row';
    row.innerHTML=`<div class="cat">${cat}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="pct">${pct}%</div>`;
    bd.appendChild(row);
  });
  const bp=document.getElementById('badgePill');
  const signedIn=typeof currentUser!=='undefined'&&!!currentUser&&!!db;
  const live=akhbaarIsLiveSet();
  if(score===QUESTIONS.length)bp.textContent=t('akhbaar.perfect_score');
  else if(score>=QUESTIONS.length*.7)bp.textContent=t('akhbaar.kaafi_tez');
  else bp.textContent=signedIn&&live?t('akhbaar.set_finished'):t('akhbaar.practice_complete');

  // Play-to-beat challenge outcome
  const beat=typeof consumeAkhbaarBeatChallenge==='function'
    ? consumeAkhbaarBeatChallenge()
    : null;
  if(beat&&beat.challenger){
    const target=beat.score!=null?Number(beat.score):null;
    let beatLine='';
    if(target!=null){
      if(score>target) beatLine=t('akhbaar.you_beat_challenger_score_vs_target', { challenger: bidi(beat.challenger), score, target });
      else if(score===target) beatLine=t('akhbaar.tied_with_challenger_at_score', { challenger: bidi(beat.challenger), score });
      else beatLine=t('akhbaar.challenger_leads_target_score_try_again', { challenger: bidi(beat.challenger), target, score });
    } else {
      beatLine=t('akhbaar.score_challenge_from_challenger_complete', { challenger: bidi(beat.challenger) });
    }
    const mount=document.getElementById('akhbaarShareMount');
    if(mount){
      const note=document.createElement('div');
      note.className='akhbaar-beat-result';
      note.textContent=beatLine;
      mount.before(note);
    }
    if(typeof showToast==='function') showToast(beatLine);
  }

  // A3: streak only after full live set + server success — never Sample / guest theater
  const big=document.getElementById('streakBig');
  if(!signedIn){
    if(big) big.textContent='—';
  } else if(!live){
    if(big) big.textContent='—';
    try{
      if(!sessionStorage.getItem('akhbaar_practice_streak_note')){
        sessionStorage.setItem('akhbaar_practice_streak_note','1');
        if(typeof showToast==='function') showToast(t('akhbaar.practice_complete_streak_counts_on_live'));
      }
    }catch(e){}
  } else if(typeof saveStreak==='function'){
    Promise.resolve(saveStreak({requireLive:true})).then((res)=>{
      if(!res||!res.ok){
        if(big&&res?.reason==='sample') big.textContent='—';
        return;
      }
      if(big) big.textContent=String(res.streak!=null?res.streak:'—');
      if(res.alreadyCounted&&typeof showToast==='function'){
        showToast(t('akhbaar.already_counted_today'));
      }
    }).catch(()=>{
      if(big) big.textContent='—';
    });
  }

  const topCat=Object.entries(categoryScores).sort((a,b)=>(b[1].correct/b[1].total)-(a[1].correct/a[1].total))[0]?.[0]||'GK';
  recordPlaySession(score,QUESTIONS.length,topCat);
  // Leaderboard: live signed-in only
  if(db&&currentUser&&live){
    const today=new Date().toISOString().split('T')[0];
    db.collection('daily_scores').doc(today).collection('scores').doc(currentUser.uid).set({
      name:userProfile?.name||currentUser.displayName||tEn('common.anonymous'),
      score,total:QUESTIONS.length,uid:currentUser.uid,
      profileType:typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal'),
      ts:firebase.firestore.FieldValue.serverTimestamp()
    }).catch((e)=>{
      if(typeof reportClientError==='function') reportClientError({feature:'akhbaar_score',message:e?.message||String(e)});
    });
  }
  wireAkhbaarShare();
}

/** A3 — real crowd proof (N≥10). Never use authored data.proof. */
const AKHBAAR_PROOF_MIN_N=10;
const _akhbaarProofCache=new Map();

function akhbaarQuestionProofKey(data,idx){
  const raw=data?.id||data?.qid||data?.firestoreId||
    `${String(data?.category||'q').slice(0,24)}_${String(data?.q||'').slice(0,48)}_${idx}`;
  return String(raw).replace(/[^\w.-]+/g,'_').slice(0,80);
}

function formatAkhbaarProofLine(proof){
  if(!proof||proof.pct==null) return '';
  const minN=proof.minN!=null?proof.minN:AKHBAAR_PROOF_MIN_N;
  if((proof.n||0)<minN) return '';
  try{
    if(typeof t==='function'){
      const line=t('social_proof',{n:proof.pct});
      if(line&&line!=='social_proof') return line;
    }
  }catch(e){}
  return `${proof.pct}% of players got this right`;
}

async function recordAkhbaarAnswerProof(data,idx,isCorrect){
  if(!akhbaarIsLiveSet()) return null;
  if(!data||data.personal||data.isSample||data.isDemo) return null;
  if(typeof currentUser==='undefined'||!currentUser) return null;
  const key=akhbaarQuestionProofKey(data,idx);
  if(typeof apiFetch!=='function') return _akhbaarProofCache.get(key)||null;
  try{
    const envelope=await apiFetch('/api/media-config',{
      method:'POST',
      needAuth:true,
      body:{
        action:'akhbaar_record_answer',
        questionKey:key,
        correct:!!isCorrect,
      },
    });
    const proof=envelope?.data||envelope;
    if(proof&&typeof proof.n==='number'){
      _akhbaarProofCache.set(key,proof);
      return proof;
    }
  }catch(e){}
  return _akhbaarProofCache.get(key)||null;
}

async function fetchAkhbaarProof(data,idx){
  if(!akhbaarIsLiveSet()) return null;
  if(!data||data.personal||akhbaarIsSampleContent(data)) return null;
  const key=akhbaarQuestionProofKey(data,idx);
  if(_akhbaarProofCache.has(key)) return _akhbaarProofCache.get(key);
  if(typeof apiFetch!=='function'||typeof currentUser==='undefined'||!currentUser) return null;
  try{
    const envelope=await apiFetch('/api/media-config',{
      method:'POST',
      needAuth:true,
      body:{action:'akhbaar_get_proof',questionKey:key},
    });
    const proof=envelope?.data||envelope;
    if(proof&&typeof proof.n==='number'){
      _akhbaarProofCache.set(key,proof);
      return proof;
    }
  }catch(e){}
  return null;
}

function fillAkhbaarProofSlot(inner,data,idx,wasCorrect){
  const el=inner?.querySelector?.('[data-akhbaar-proof]');
  if(!el) return;
  // Never show authored data.proof — Sample / offline / personal omit
  if(!akhbaarIsLiveSet()||akhbaarIsSampleContent(data)||data.personal){
    el.classList.add('hidden');
    el.textContent='';
    return;
  }
  const apply=(proof)=>{
    const line=formatAkhbaarProofLine(proof);
    if(!line){
      el.classList.add('hidden');
      el.textContent='';
      return;
    }
    el.classList.remove('hidden');
    el.textContent=line;
  };
  const cached=inner._akhbaarProof||_akhbaarProofCache.get(akhbaarQuestionProofKey(data,idx));
  if(cached){apply(cached);return;}
  Promise.resolve(
    typeof currentUser!=='undefined'&&currentUser
      ? recordAkhbaarAnswerProof(data,idx,wasCorrect)
      : fetchAkhbaarProof(data,idx)
  ).then(apply).catch(()=>apply(null));
}

/** Dangal-style share shell on Akhbaar results (card + Share / friend / story). */
function getAkhbaarShareStats(){
  const total=typeof QUESTIONS!=='undefined'?QUESTIONS.length:0;
  const streak=parseInt(document.getElementById('streakNum')?.textContent,10)||0;
  const dateLabel=(typeof formatDate==='function'?formatDate(new Date(),'dayMonth'):new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'}));
  const live=akhbaarIsLiveSet();
  const brand=live?t('akhbaar.aaj_ka_akhbaar'):t('akhbaar.sample_practice');
  const practiceUrl=`${location.origin}/?tab=akhbaar`;
  const beatUrl=typeof buildBeatScoreLink==='function'
    ? buildBeatScoreLink('akhbaar', score, {cat:'Akhbaar'})
    : `${location.origin}/challenge/akhbaar?score=${score}&cat=Akhbaar&name=${encodeURIComponent(userProfile?.name||tEn('common.someone'))}`;
  // Sample: Demo-framed share OK; URL is home tab — never a live beat/challenge link
  const shareUrl=live?beatUrl:practiceUrl;
  return typeof buildShareStats==='function'
    ? buildShareStats({
        scoreLine:`${score}/${total}`,
        score,
        total,
        streak: live?streak:0,
        meta:live&&streak?t('akhbaar.share_meta_streak',{ brand, date: dateLabel, count: streak }):t('akhbaar.share_meta',{ brand, date: dateLabel }),
        cat:'Akhbaar',
        text: live
          ? t('akhbaar.aaj_ke_akhbaar_mein_maine_score', { score, total })
          : t('akhbaar.i_practiced_akhbaar_score_total_sample', { score, total }),
        url: shareUrl,
      })
    : {
        scoreLine:`${score}/${total}`,
        score,
        total,
        streak: live?streak:0,
        meta:t('akhbaar.share_meta',{ brand, date: dateLabel }),
        text: live
          ? t('akhbaar.aaj_ke_akhbaar_mein_maine_score', { score, total })
          : t('akhbaar.i_practiced_akhbaar_score_total', { score, total }),
        url: shareUrl,
      };
}

function wireAkhbaarShare(){
  const mount=document.getElementById('akhbaarShareMount');
  if(!mount) return;
  const live=akhbaarIsLiveSet();
  const signedIn=typeof currentUser!=='undefined'&&!!currentUser;
  const shareStats=getAkhbaarShareStats();
  const cardHtml=typeof buildGameShareCard==='function'
    ? buildGameShareCard('akhbaar', shareStats)
    : '';
  // Sample share policy: practice share OK with Demo framing; beat/challenge friends = live-only
  mount.innerHTML=`
    ${cardHtml}
    ${!live?`<p class="akhbaar-share-note" style="font-size:12px;color:var(--muted);margin:8px 0 0;">${tHtml('akhbaar.sample_practice_sharing_won_t_claim')}</p>`:''}
    <div class="game-result-actions akhbaar-share-actions" id="akhbaarShareActions">
      <button type="button" class="game-result-btn game-result-btn--primary" data-akh-share="share">${live?tHtml('akhbaar.share_score'):tHtml('akhbaar.share_practice_score')}</button>
      <button type="button" class="game-result-btn" data-akh-share="challenge" ${live?'':'disabled'} title="${live?'':tHtml('akhbaar.live_akhbaar_set_needed_to_challenge')}">${tHtml('akhbaar.challenge_a_friend')}</button>
      <button type="button" class="game-result-btn" data-akh-share="story">${live?tHtml('akhbaar.post_to_story'):tHtml('akhbaar.post_practice_story')}</button>
    </div>`;

  const actions=mount.querySelector('#akhbaarShareActions');
  if(!actions) return;

  const needAuthForShare=(kind)=>{
    if(signedIn) return false;
    try{
      sessionStorage.setItem('chaupaal_akhbaar_pending_share', kind||'share');
    }catch(e){}
    if(typeof ChaupaalReferrals?.stashPendingAction==='function') ChaupaalReferrals.stashPendingAction('akhbaar_share');
    else if(typeof stashPendingAction==='function') stashPendingAction('akhbaar_share');
    else try{sessionStorage.setItem('chaupaal_pending_action','akhbaar_share');}catch(e){}
    if(typeof showToast==='function') showToast(t('akhbaar.sign_in_to_share_your_score'));
    if(typeof openAuthSheet==='function') openAuthSheet('login');
    else if(typeof showAuth==='function') showAuth();
    return true;
  };

  const runShare=()=>{
    try{if(typeof haptic==='function')haptic('light');}catch(e){}
    const card=mount.querySelector('.game-share-card');
    if(card&&typeof pulseGameEl==='function') pulseGameEl(card);
    if(typeof shareGameResult==='function') shareGameResult('akhbaar', shareStats);
    else if(typeof openUnifiedShareSheet==='function') openUnifiedShareSheet({gameId:'akhbaar',title:live?t('akhbaar.share_akhbaar_score'):t('akhbaar.share_practice_score'),stats:shareStats});
  };

  actions.querySelector('[data-akh-share="share"]')?.addEventListener('click',()=>{
    if(needAuthForShare('share')) return;
    runShare();
  });

  actions.querySelector('[data-akh-share="challenge"]')?.addEventListener('click',async()=>{
    if(!live){
      if(typeof showToast==='function') showToast(t('akhbaar.live_akhbaar_set_needed_to_challenge'));
      return;
    }
    if(needAuthForShare('challenge')) return;
    if(typeof openFriendPickerSheet!=='function'){
      runShare();
      return;
    }
    const friend=await openFriendPickerSheet({
      title:t('akhbaar.challenge_a_friend'),
      subtitle:t('akhbaar.send_a_beat_my_score_link'),
    });
    if(!friend) return;
    const beatUrl=typeof buildBeatScoreLink==='function'
      ? buildBeatScoreLink('akhbaar', shareStats.score, {cat:'Akhbaar'})
      : shareStats.url;
    const personalized={
      ...shareStats,
      url:beatUrl,
      friendText:t('akhbaar.hey_name_i_scored_scoreline_on', { name: friend.name, scoreLine: shareStats.scoreLine }),
      text:t('akhbaar.hey_name_i_scored_scoreline_on', { name: friend.name, scoreLine: shareStats.scoreLine }),
    };
    if(typeof openFriendShareFollowup==='function'){
      await openFriendShareFollowup(friend,'akhbaar',personalized);
    } else if(typeof shareGameResult==='function'){
      shareGameResult('akhbaar',personalized);
    }
  });

  actions.querySelector('[data-akh-share="story"]')?.addEventListener('click',()=>{
    if(needAuthForShare('story')) return;
    if(typeof postGameScoreStory==='function'){
      postGameScoreStory('akhbaar',{
        ...shareStats,
        destination:'baithak',
        visibility:'friends',
      });
    } else if(typeof shareAkhbaarScore==='function'){
      shareAkhbaarScore('friends');
    }
  });
}

window.applyAkhbaarBeatBanner=applyAkhbaarBeatBanner;
window.consumeAkhbaarBeatChallenge=consumeAkhbaarBeatChallenge;
window.wireAkhbaarShare=wireAkhbaarShare;
window.akhbaarIsLiveSet=akhbaarIsLiveSet;

/** A2: Surkhiya/Saathi → jump into Khabar reel (optionally focused on a card). */
function focusAkhbaarQuestionAt(idx){
  const stage=document.getElementById('reelStage');
  const i=Number(idx);
  if(!stage||!Number.isFinite(i)||i<0) return false;
  try{maxUnlocked=Math.max(maxUnlocked,i);}catch(e){}
  if(typeof _akhbaarUpdateProgress==='function') _akhbaarUpdateProgress();
  stage.scrollTo({top:i*stage.clientHeight,behavior:'smooth'});
  return true;
}

function jumpToAkhbaarKhabar(opts){
  const o=opts||{};
  const pendingIdx=o.idx!=null?Number(o.idx):null;
  window.__akhbaarPendingFocusIdx=Number.isFinite(pendingIdx)?pendingIdx:null;
  if(typeof setAkhbaarMode==='function') setAkhbaarMode('all');
  const apply=()=>{
    const pending=window.__akhbaarPendingFocusIdx;
    window.__akhbaarPendingFocusIdx=null;
    if(pending==null) return;
    if(!focusAkhbaarQuestionAt(pending)&&typeof showToast==='function'){
      showToast(t('akhbaar.playing_today_s_khabar'));
    }
  };
  setTimeout(apply,350);
  if(typeof window.ensureAkhbaarBuilt==='function'){
    try{
      Promise.resolve(window.ensureAkhbaarBuilt()).then(()=>setTimeout(apply,200)).catch(()=>{});
    }catch(e){}
  }
}
window.focusAkhbaarQuestionAt=focusAkhbaarQuestionAt;
window.jumpToAkhbaarKhabar=jumpToAkhbaarKhabar;


// Reel-build boundary (CONVENTIONS 4c) — question set comes from the network
if (typeof safeFeature === 'function') buildAkhbaar = safeFeature('akhbaar_build', buildAkhbaar);
