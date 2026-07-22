// ===================== AKHBAAR (Reel questions) =====================
const observer=new IntersectionObserver(entries=>{
  entries.forEach(e=>e.target.classList.toggle('active',e.intersectionRatio>0.6));
},{root:document.getElementById('reelStage'),threshold:[0,0.6,1]});

function buildAkhbaar(QUESTIONS,BONUS_QUESTIONS){
  const stage=document.getElementById('reelStage');
  stage.innerHTML='';score=0;maxUnlocked=0;categoryScores={};

  // Build progress bar
  const pb=document.getElementById('progressBar');
  pb.innerHTML='';
  QUESTIONS.forEach((_,i)=>{const s=document.createElement('div');s.className='seg';s.dataset.i=i;pb.appendChild(s);});

  function updateProgress(){
    pb.querySelectorAll('.seg').forEach((s,i)=>{s.classList.toggle('fill',i<maxUnlocked);});
  }

  // Question cards
  QUESTIONS.forEach((data,idx)=>{
    const card=document.createElement('div');card.className='reel-card';
    const inner=document.createElement('div');inner.className='card-inner';inner.id=`inner-${idx}`;
    card.appendChild(inner);stage.appendChild(card);
    renderQuestion(inner,data,idx,updateProgress);
    observer.observe(inner);
  });

  // Results card
  const resultsCard=document.createElement('div');resultsCard.className='reel-card';
  const rc=document.createElement('div');rc.className='results-card';rc.id='resultsCard';
  rc.innerHTML=`
    <div class="results-brand"><svg width="20" height="20" viewBox="0 0 34 34" fill="none"><rect width="34" height="34" rx="9" fill="#E63946"/><rect x="6" y="14" width="22" height="3.5" rx="1.5" fill="#FFC93C"/><path d="M9 17.5V8M12.5 17.5V8M16 17.5V8.5M19.5 17.5V8M23 17.5V8" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><path d="M9.5 17.5L7.5 25M24.5 17.5L26.5 25" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg> Chaupaal — Aaj ka Akhbaar<span class="results-date" id="resultsDate"></span></div>
    <div class="score-big" id="scoreBig">0<span>/${QUESTIONS.length}</span></div>
    <div class="score-label">Questions answered correctly</div>
    <div class="breakdown" id="breakdown"></div>
    <div class="streak-row"><div class="streak-pill-big">🔥 <span id="streakBig">1</span> day streak</div><div class="badge-pill" id="badgePill">🏅 Badge</div></div>
    <div class="akhbaar-share-mount" id="akhbaarShareMount"></div>
  `;
  resultsCard.appendChild(rc);stage.appendChild(resultsCard);
  observer.observe(rc);

  // Aur Sunao card
  const asCard=document.createElement('div');asCard.className='reel-card';
  const asInner=document.createElement('div');asInner.className='aur-sunao-card';
  const asQ=AUR_SUNAO_QUESTIONS[Math.floor(Math.random()*AUR_SUNAO_QUESTIONS.length)];
  asInner.innerHTML=`
    <div class="aur-sunao-label">✨ Aur Sunao</div>
    <div class="aur-sunao-q">${asQ.q}</div>
    <div class="aur-sunao-opts">${asQ.options.map((o,i)=>`<button class="as-opt" data-i="${i}">${o}</button>`).join('')}</div>
    <div class="hint show" style="color:rgba(255,255,255,0.4);margin-top:14px;">This just helps us understand your preferences 🙂</div>
  `;
  asCard.appendChild(asInner);stage.appendChild(asCard);
  asInner.querySelectorAll('.as-opt').forEach(btn=>btn.addEventListener('click',()=>{
    asInner.querySelectorAll('.as-opt').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    showToast('Shukriya! Yeh aapko better matches dhundhne mein help karega 🎯');
  }));
  observer.observe(asInner);

  // Bonus pool cards
  if(BONUS_QUESTIONS.length){
    const bonusIntro=document.createElement('div');bonusIntro.className='reel-card';
    const bi=document.createElement('div');bi.className='card-inner';bi.style.cssText='align-items:center;justify-content:center;text-align:center;gap:10px;';
    bi.innerHTML=`<div style="font-size:36px;">🎁</div><div class="q-text" style="margin:0;">Aur Khabar</div><div style="font-size:13px;color:var(--muted);">Bonus questions — streak par asar nahi padega</div>`;
    bonusIntro.appendChild(bi);stage.appendChild(bonusIntro);observer.observe(bi);
    BONUS_QUESTIONS.forEach((data,i)=>{
      const idx=QUESTIONS.length+1+i;
      const card=document.createElement('div');card.className='reel-card';
      const inner=document.createElement('div');inner.className='card-inner';inner.id=`inner-${idx}`;
      card.appendChild(inner);stage.appendChild(card);
      renderQuestion(inner,data,idx,()=>{});observer.observe(inner);
    });
  }

  // Scroll observer for progress + unlock
  const reelStage=document.getElementById('reelStage');
  let isSnapping=false;
  reelStage.addEventListener('scroll',()=>{
    if(isSnapping)return;
    const idx=Math.round(reelStage.scrollTop/reelStage.clientHeight);
    if(idx>maxUnlocked&&idx<QUESTIONS.length){
      isSnapping=true;reelStage.scrollTo({top:maxUnlocked*reelStage.clientHeight,behavior:'smooth'});
      setTimeout(()=>isSnapping=false,400);return;
    }
    updateProgress();
  });

  // Share wired in populateResults via Dangal share helpers
  // (buildGameShareCard / shareGameResult / openFriendPickerSheet / postGameScoreStory)
  if(typeof applyAkhbaarBeatBanner==='function') applyAkhbaarBeatBanner();

  // Simulated breaking news after 6s
  setTimeout(()=>{
    stage.querySelectorAll('[data-breaking]').forEach(tag=>{tag.classList.remove('hidden');});
    showToast('🔴 A Taaza Khabar just dropped!');
  },6000);
}

/** Beat-my-score banner for `?game=akhbaar&challenge=…&score=…` deep links. */
function applyAkhbaarBeatBanner(){
  const pending=window.__akhbaarBeatChallenge;
  if(!pending||!pending.challenger) return;
  document.getElementById('akhbaarBeatBanner')?.remove();
  const panel=document.getElementById('panel-akhbaar')||document.getElementById('reelStage')?.parentElement;
  if(!panel) return;
  const banner=document.createElement('div');
  banner.id='akhbaarBeatBanner';
  banner.className='akhbaar-beat-banner';
  banner.innerHTML=`
    <div class="akhbaar-beat-copy">
      <strong>${pending.challenger} challenged you</strong>
      <span>Beat ${pending.score!=null?pending.score:'their score'} on today's Akhbaar</span>
    </div>
    <button type="button" class="akhbaar-beat-dismiss" aria-label="Dismiss">✕</button>`;
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

function renderQuestion(inner,data,idx,updateProgress){
  const isPersonal=data.personal||false;
  inner.innerHTML=`
    <div class="q-tag ${isPersonal?'personal':'news'}">${isPersonal?'👥 Personal':data.category}</div>
    <div class="q-text">${data.q}</div>
    <div class="options">${data.options.map((o,i)=>`<button class="opt" data-i="${i}"><span>${o}</span><span class="mark"></span></button>`).join('')}</div>
    ${data.proof!==null?`<div class="social-proof hidden" id="proof-${idx}"></div>`:''}
    ${!isPersonal?`<div class="flag-row hidden" id="flagRow-${idx}"><button class="flag-btn" id="flagBtn-${idx}">⚑ Flag this question</button></div>`:''}
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

    // Floating emojis
    const layer=inner.querySelector(`#floatLayer-${idx}`);
    if(!quietMode){
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

    // Social proof
    if(data.proof!==null){const p=inner.querySelector(`#proof-${idx}`);if(p){p.textContent=`${data.proof}% of players got this right`;p.classList.remove('hidden');}}

    // Flag row
    if(!isPersonal){
      const fr=inner.querySelector(`#flagRow-${idx}`);if(fr)fr.classList.remove('hidden');
      const fb=inner.querySelector(`#flagBtn-${idx}`);
      if(fb)fb.addEventListener('click',()=>{fb.classList.toggle('flagged');fb.textContent=fb.classList.contains('flagged')?t('flagged'):t('flag');});
    }

    maxUnlocked=Math.max(maxUnlocked,idx+1);
    updateProgress();

    // Show news summary after delay
    setTimeout(()=>showNewsSummary(inner,data,idx),1400);
  }));
}

function showNewsSummary(inner,data,idx){
  const wasCorrect=inner.dataset.wasCorrect==='true';
  const sourceLine=data.personal?`<div class="news-source">${t('source_personal')}</div>`:`<div class="news-source">${t('source_news',{date:new Date().toDateString()})}</div>`;
  const explainHtml=(!wasCorrect&&data.explain)?`<div class="explain-box">💡 <strong>${t('why')}</strong> ${data.explain}</div>`:'';
  const linkHtml=data.link?`<a class="news-link" href="${data.link}" target="_blank" rel="noopener">${t('read_more')}</a>`:'';
  const hintText=idx===QUESTIONS.length-1?t('scroll_recap'):t('scroll_next');
  inner.innerHTML=`
    <div class="q-tag ${data.personal?'personal':'news'}">${data.personal?'👥 Personal':data.category}</div>
    <div class="news-summary">
      <div class="news-headline">${data.headline||'About this question'}</div>
      ${explainHtml}
      <div class="news-body">${data.news||'This question is based on recent news.'}</div>
      ${linkHtml}${sourceLine}
      <div class="hint show">${hintText}</div>
    </div>
  `;
  // populate results if last question
  if(idx===QUESTIONS.length-1)setTimeout(()=>populateResults(),200);
}

function populateResults(){
  document.getElementById('scoreBig').innerHTML=`${score}<span>/${QUESTIONS.length}</span>`;
  document.getElementById('resultsDate').textContent=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'});
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
  if(score===QUESTIONS.length)bp.textContent='🏅 Perfect Score!';
  else if(score>=QUESTIONS.length*.7)bp.textContent='⭐ Kaafi Tez!';
  else bp.textContent='🔥 Streak Kept';

  // Play-to-beat challenge outcome
  const beat=typeof consumeAkhbaarBeatChallenge==='function'
    ? consumeAkhbaarBeatChallenge()
    : null;
  if(beat&&beat.challenger){
    const target=beat.score!=null?Number(beat.score):null;
    let beatLine='';
    if(target!=null){
      if(score>target) beatLine=`You beat ${beat.challenger} (${score} vs ${target})!`;
      else if(score===target) beatLine=`Tied with ${beat.challenger} at ${score}`;
      else beatLine=`${beat.challenger} leads ${target}–${score} — try again tomorrow`;
    } else {
      beatLine=`Challenge from ${beat.challenger} complete`;
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

  const newStreak=parseInt(document.getElementById('streakNum').textContent)+1;
  document.getElementById('streakBig').textContent=newStreak;
  document.getElementById('streakNum').textContent=newStreak;
  updateSidebarStreak(newStreak);
  // Persist streak and record session
  saveStreak();
  const topCat=Object.entries(categoryScores).sort((a,b)=>(b[1].correct/b[1].total)-(a[1].correct/a[1].total))[0]?.[0]||'GK';
  recordPlaySession(score,QUESTIONS.length,topCat);
  // Save to leaderboard
  if(db&&currentUser){
    const today=new Date().toISOString().split('T')[0];
    db.collection('daily_scores').doc(today).collection('scores').doc(currentUser.uid).set({
      name:userProfile?.name||currentUser.displayName||'Anonymous',
      score,total:QUESTIONS.length,uid:currentUser.uid,
      profileType:typeof ownProfileType==='function'?ownProfileType():(typeof getProfileType==='function'?getProfileType():'personal'),
      ts:firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  }
  wireAkhbaarShare();
}

/** Dangal-style share shell on Akhbaar results (card + Share / friend / story). */
function getAkhbaarShareStats(){
  const total=typeof QUESTIONS!=='undefined'?QUESTIONS.length:0;
  const streak=parseInt(document.getElementById('streakNum')?.textContent,10)||0;
  const dateLabel=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  return typeof buildShareStats==='function'
    ? buildShareStats({
        scoreLine:`${score}/${total}`,
        score,
        total,
        streak,
        meta:`Aaj ka Akhbaar · ${dateLabel}${streak?` · ${streak}-day streak`:''}`,
        cat:'Akhbaar',
        text:`Aaj ke Akhbaar mein maine ${score}/${total} sahi jawab diye! Chaupaal pe milte hain.`,
        url: typeof buildBeatScoreLink==='function'
          ? buildBeatScoreLink('akhbaar', score, {cat:'Akhbaar'})
          : `${location.origin}${location.pathname}?challenge=${encodeURIComponent(userProfile?.name||'Someone')}&game=akhbaar&score=${score}`,
      })
    : {
        scoreLine:`${score}/${total}`,
        score,
        total,
        streak,
        meta:`Aaj ka Akhbaar · ${dateLabel}`,
        text:`Aaj ke Akhbaar mein maine ${score}/${total} sahi jawab diye! Chaupaal pe milte hain.`,
      };
}

function wireAkhbaarShare(){
  const mount=document.getElementById('akhbaarShareMount');
  if(!mount) return;
  const shareStats=getAkhbaarShareStats();
  const cardHtml=typeof buildGameShareCard==='function'
    ? buildGameShareCard('akhbaar', shareStats)
    : '';
  mount.innerHTML=`
    ${cardHtml}
    <div class="game-result-actions akhbaar-share-actions" id="akhbaarShareActions">
      <button type="button" class="game-result-btn game-result-btn--primary" data-akh-share="share">Share</button>
      <button type="button" class="game-result-btn" data-akh-share="friend">Share with friend</button>
      <button type="button" class="game-result-btn" data-akh-share="story">Post to story</button>
    </div>`;

  const actions=mount.querySelector('#akhbaarShareActions');
  if(!actions) return;

  actions.querySelector('[data-akh-share="share"]')?.addEventListener('click',()=>{
    try{if(typeof haptic==='function')haptic('light');}catch(e){}
    const card=mount.querySelector('.game-share-card');
    if(card&&typeof pulseGameEl==='function') pulseGameEl(card);
    if(typeof shareGameResult==='function') shareGameResult('akhbaar', shareStats);
    else if(typeof openUnifiedShareSheet==='function') openUnifiedShareSheet({gameId:'akhbaar',title:'Share Akhbaar score',stats:shareStats});
  });

  actions.querySelector('[data-akh-share="friend"]')?.addEventListener('click',async()=>{
    if(typeof openFriendPickerSheet!=='function'){
      if(typeof shareGameResult==='function') shareGameResult('akhbaar', shareStats);
      return;
    }
    const friend=await openFriendPickerSheet({
      title:'Share with a friend',
      subtitle:'Send your Akhbaar score',
    });
    if(!friend) return;
    const personalized={
      ...shareStats,
      friendText:`Hey ${friend.name} — aaj ke Akhbaar mein maine ${shareStats.scoreLine} sahi kiye. Beat me on Chaupaal!`,
      text:`Hey ${friend.name} — aaj ke Akhbaar mein maine ${shareStats.scoreLine} sahi kiye. Beat me on Chaupaal!`,
    };
    if(typeof openFriendShareFollowup==='function'){
      await openFriendShareFollowup(friend,'akhbaar',personalized);
    } else if(typeof shareGameResult==='function'){
      shareGameResult('akhbaar',personalized);
    }
  });

  actions.querySelector('[data-akh-share="story"]')?.addEventListener('click',()=>{
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
