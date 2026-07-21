// ===================== MICRO-INTERACTIONS & VISUAL POLISH =====================

// ---- Confetti system ----
function launchConfetti(origin, count=60){
  const container = document.querySelector('.device');
  const colors=['#E63946','#FFC93C','#33C481','#3498DB','#9B59B6','#FF9A3C','#fff'];
  for(let i=0;i<count;i++){
    const el=document.createElement('div');
    el.className='confetti-piece';
    const size=6+Math.random()*6;
    el.style.cssText=`
      left:${(origin?.x||50)}%;
      top:${(origin?.y||30)}%;
      width:${size}px; height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>0.5?'50%':'2px'};
      animation-duration:${1.2+Math.random()*1.5}s;
      animation-delay:${Math.random()*0.4}s;
      transform-origin:center;
    `;
    // Random horizontal spread
    const dx = (Math.random()-0.5)*160;
    el.animate([
      {transform:`translate(0,0) rotate(0deg)`,opacity:1},
      {transform:`translate(${dx}px,${120+Math.random()*200}px) rotate(${360+Math.random()*360}deg)`,opacity:0}
    ],{duration:1200+Math.random()*1500,delay:Math.random()*400,easing:'cubic-bezier(0,0,0.2,1)',fill:'forwards'}).onfinish=()=>el.remove();
    container.appendChild(el);
  }
}

// ---- Ripple effect ----
function addRipple(el){
  el.addEventListener('click',function(e){
    const rect=el.getBoundingClientRect();
    const deviceRect=document.querySelector('.device').getBoundingClientRect();
    const ripple=document.createElement('span');
    ripple.className='ripple';
    const size=Math.max(el.offsetWidth,el.offsetHeight)*2;
    ripple.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
    el.style.position='relative';el.style.overflow='hidden';
    el.appendChild(ripple);
    ripple.getClientRects(); // force reflow
    ripple.style.animation='rippleAnim 0.5s linear forwards';
    ripple.addEventListener('animationend',()=>ripple.remove());
  });
}

// Apply ripple to primary buttons
function wireRipples(){
  document.querySelectorAll('.dangal-action-btn,.peepal-ask-btn,.auth-btn,.discovery-nudge-btn,.peepal-nudge-cta,.premium-cta').forEach(el=>{
    if(!el.dataset.rippled){el.dataset.rippled='1';addRipple(el);}
  });
}

// Skeleton loader lives in ui-states.js (Phase 1) — keep a thin fallback if that script failed to load.
if(typeof createSkeleton!=='function'){
  function createSkeleton(rows=3, variant='card'){
    const wrap=document.createElement('div');wrap.className='skeleton-wrap';
    wrap.textContent='Loading…';
    return wrap;
  }
}

// ---- Count-up animation ----
function animateCount(el, from, to, duration=800){
  const start=performance.now();
  function update(now){
    const progress=Math.min((now-start)/duration,1);
    const eased=1-Math.pow(1-progress,3); // cubic ease out
    el.textContent=Math.round(from+(to-from)*eased);
    el.classList.toggle('count-animate',progress<0.1);
    if(progress<1)requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ---- Tab transition ----
const _originalTabSwitcher=document.querySelectorAll.bind(document);
function animateTabSwitch(incoming, outgoing){
  if(!incoming||!outgoing||incoming===outgoing)return;
  incoming.style.animation='none';
  incoming.offsetHeight; // reflow
  incoming.style.animation='panelFadeIn 250ms cubic-bezier(0,0,0.2,1)';
}

// Override tab switching to add animations and ripple wiring
const _origTabBtnListener=document.querySelector('.tab-btn');
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(typeof SoundLib!=='undefined'&&SoundLib.tap) SoundLib.tap();
    try{haptic('light');}catch(e){}
    wireRipples();
    // Add data attributes to peepal cards for color coding
    setTimeout(wirePeepalCardTypes,100);
    // Animate streak number on akhbaar tab
    if(btn.dataset.tab==='akhbaar'){
      const el=document.getElementById('streakNum');
      if(el){const v=parseInt(el.textContent)||0;animateCount(el,Math.max(0,v-3),v,600);}
    }
  });
});

// ---- Wire Peepal card types for CSS color-coding ----
function wirePeepalCardTypes(){
  document.querySelectorAll('.peepal-card').forEach(card=>{
    const tag=card.querySelector('.q-tag');
    if(!tag)return;
    const txt=tag.textContent.toLowerCase();
    let fmt='open';
    if(txt.includes('mcq')||txt.includes('gk')||txt.includes('sports')||txt.includes('tech'))fmt='mcq';
    else if(txt.includes('binary')||txt.includes('debate'))fmt='binary';
    else if(txt.includes('poll'))fmt='poll';
    card.dataset.format=fmt;
    tag.dataset.fmt=fmt;
  });
}

// ---- Haptic feedback (where supported) ----
function haptic(type='light'){
  if(!navigator.vibrate)return;
  const patterns={light:10,medium:25,heavy:50,success:[10,50,10],error:[50,50,50]};
  navigator.vibrate(patterns[type]||10);
}

/** Toggle button loading spinner + aria-busy for submit flows. */
function setButtonLoading(btn, loading, busyLabel){
  if(!btn) return;
  if(loading){
    if(!btn.dataset.labelCache) btn.dataset.labelCache = btn.textContent || '';
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy','true');
    btn.disabled = true;
    if(busyLabel) btn.setAttribute('aria-label', busyLabel);
  } else {
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
    btn.removeAttribute('aria-label');
    btn.disabled = false;
    if(btn.dataset.labelCache != null){
      btn.textContent = btn.dataset.labelCache;
      delete btn.dataset.labelCache;
    }
  }
}
window.setButtonLoading=setButtonLoading;

/** In-app name sheet — replaces native prompt() for Highlights etc. */
function promptNameSheet(opts={}){
  const {
    title='Name',
    placeholder='Enter a name',
    confirmLabel='Save',
    allowBlank=false,
    initial='',
    inputMode='',
    maxlength=40,
  }=opts;
  return new Promise((resolve)=>{
    document.getElementById('promptNameSheet')?.remove();
    try{haptic('light');}catch(e){}
    const sheet=document.createElement('div');
    sheet.id='promptNameSheet';
    sheet.className='name-prompt-sheet';
    sheet.innerHTML=`
      <div class="name-prompt-backdrop" data-np-cancel></div>
      <div class="name-prompt-card" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="name-prompt-title">${title}</div>
        <input class="auth-input name-prompt-input" type="text" maxlength="${maxlength}" placeholder="${placeholder}" value="${String(initial||'').replace(/"/g,'&quot;')}" data-np-input${inputMode?` inputmode="${inputMode}"`:''}>
        <div class="name-prompt-actions">
          <button type="button" class="btn" data-np-cancel>Cancel</button>
          <button type="button" class="btn btn--primary" data-np-ok>${confirmLabel}</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const input=sheet.querySelector('[data-np-input]');
    let settled=false;
    const finish=(val)=>{
      if(settled) return;
      settled=true;
      if(typeof removeNavLayer==='function') removeNavLayer(sheet);
      sheet.remove();
      resolve(val);
    };
    if (typeof pushNavLayer === 'function') {
      pushNavLayer(sheet, () => finish(null));
    }
    sheet.querySelectorAll('[data-np-cancel]').forEach(el=>el.addEventListener('click',()=>finish(null)));
    sheet.querySelector('[data-np-ok]')?.addEventListener('click',()=>{
      const v=(input?.value||'').trim();
      if(!v&&!allowBlank){if(typeof showToast==='function')showToast('Enter a name');return;}
      finish(v);
    });
    input?.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'){e.preventDefault();sheet.querySelector('[data-np-ok]')?.click();}
      if(e.key==='Escape')finish(null);
    });
    setTimeout(()=>input?.focus(),50);
  });
}
window.promptNameSheet=promptNameSheet;

/** In-app confirm sheet — replaces native confirm(). */
function confirmSheet(opts={}){
  const {
    title='Confirm',
    message='',
    confirmLabel='Confirm',
    cancelLabel='Cancel',
    danger=false,
  }=opts;
  return new Promise((resolve)=>{
    document.getElementById('confirmSheet')?.remove();
    try{haptic('light');}catch(e){}
    const sheet=document.createElement('div');
    sheet.id='confirmSheet';
    sheet.className='name-prompt-sheet confirm-prompt-sheet';
    sheet.innerHTML=`
      <div class="name-prompt-backdrop" data-cf-cancel></div>
      <div class="name-prompt-card" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="name-prompt-title">${title}</div>
        ${message?`<div class="confirm-prompt-msg">${message}</div>`:''}
        <div class="name-prompt-actions">
          <button type="button" class="btn" data-cf-cancel>${cancelLabel}</button>
          <button type="button" class="btn btn--primary${danger?' btn--danger':''}" data-cf-ok>${confirmLabel}</button>
        </div>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    let settled=false;
    const finish=(val)=>{
      if(settled) return;
      settled=true;
      if(typeof removeNavLayer==='function') removeNavLayer(sheet);
      sheet.remove();
      resolve(!!val);
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, () => finish(false));
    sheet.querySelectorAll('[data-cf-cancel]').forEach(el=>el.addEventListener('click',()=>finish(false)));
    sheet.querySelector('[data-cf-ok]')?.addEventListener('click',()=>finish(true));
    sheet.addEventListener('keydown',(e)=>{ if(e.key==='Escape') finish(false); });
  });
}
window.confirmSheet=confirmSheet;

// ---- Enhanced streak milestone with confetti ----
const _origShowStreakMilestone=showStreakMilestone;
window.showStreakMilestone=function(streak){
  _origShowStreakMilestone(streak);
  setTimeout(()=>launchConfetti({x:50,y:30},80),200);
  haptic('success');
};

// ---- Correct answer confetti ----
const _origSoundLibFeedback=SoundLib.playFeedback.bind(SoundLib);
SoundLib.playFeedback=function(correct,mode){
  _origSoundLibFeedback(correct,mode);
  if(correct){
    haptic('success');
    if(Math.random()<0.3) launchConfetti({x:50,y:50},30);
  } else {
    haptic('error');
  }
};

// ---- Skeleton loaders for Peepal feed ----
const _origRenderPeepalFeed=renderPeepalFeed;
window.renderPeepalFeed=function(){
  const feed=document.getElementById('peepalFeed');
  if(feed&&!feed.dataset.loaded){
    feed.innerHTML='';
    [1,2,3].forEach(()=>feed.appendChild(createSkeleton(2,'card')));
    setTimeout(()=>{_origRenderPeepalFeed();wirePeepalCardTypes();wireRipples();},400);
    return;
  }
  _origRenderPeepalFeed();
  setTimeout(()=>{wirePeepalCardTypes();wireRipples();},100);
};

// ---- Skeleton for Duniya feed ----
const _origRenderDuniyaFeed=renderDuniyaFeed;
window.renderDuniyaFeed=function(){
  const feed=document.getElementById('duniyaFeed');
  if(feed&&!feed.dataset.skeletonShown){
    feed.dataset.skeletonShown='1';
    feed.innerHTML='';
    [1,2].forEach(()=>feed.appendChild(createSkeleton(1,'feed')));
    setTimeout(()=>{_origRenderDuniyaFeed();wireRipples();},500);
    return;
  }
  _origRenderDuniyaFeed();
  setTimeout(wireRipples,100);
};

// ---- Add visual richness to game tiles ----
function styleDangalTiles(){
  const colors={
    chess:['#2C3E50','#ECF0F1'],snakes:['#27AE60','#fff'],
    ludo:['#C0392B','#fff'],uno:['#E74C3C','#fff'],
    ttt:['#2980B9','#fff'],wordguess:['#8E44AD','#fff'],
    business:['#F39C12','#fff'],scribble:['#16A085','#fff'],
    fiveinrow:['#2C3E50','#3498DB'],rushrunner:['#E67E22','#fff'],
    tiptap:['#9B59B6','#FF6B9D'],quiz:null
  };
  document.querySelectorAll('.dangal-game-tile[data-game]').forEach(tile=>{
    const game=tile.dataset.game;
    const col=colors[game];
    if(col&&!tile.classList.contains('featured')){
      // Add subtle colored top accent
      tile.style.borderTop=`3px solid ${col[0]}`;
    }
  });
}

// Theme class is applied by theme.js applyTheme — keep a thin alias for polish
function applyThemeClass(themeKey){
  // No-op duplicate of applyTheme's class work; retained so older call sites stay safe
  if(typeof applyTheme === 'function' && !applyTheme._fromPolish){
    // already handled inside applyTheme
  }
}

// Ensure polish layer doesn't break applyTheme; re-apply class after any side effects
(function(){
  const _origApplyTheme = typeof applyTheme === 'function' ? applyTheme : function(){};
  window.applyTheme = function(key){
    _origApplyTheme(key);
  };
})();

// ---- Discovery card entrance animation ----
function animateDiscoveryCards(){
  document.querySelectorAll('.discovery-card').forEach((card,i)=>{
    card.style.opacity='0';
    card.style.transform='translateY(16px)';
    setTimeout(()=>{
      card.style.transition='opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      card.style.opacity='1';
      card.style.transform='translateY(0)';
    },i*100+50);
  });
}

// ---- Boot: wire everything once DOM is ready ----
setTimeout(()=>{
  wireRipples();
  wirePeepalCardTypes();
  styleDangalTiles();
  // Animate streak display
  const streakEl=document.getElementById('streakNum');
  if(streakEl&&parseInt(streakEl.textContent)){animateCount(streakEl,0,parseInt(streakEl.textContent),1000);}
  // Observe new content for ripple wiring
  const obs=new MutationObserver(()=>{wireRipples();wirePeepalCardTypes();styleDangalTiles();});
  const device=document.querySelector('.device');
  if(device)obs.observe(device,{childList:true,subtree:true});
},2000);

// ---- Patch initPeepal to animate discovery cards ----
const _origInitPeepal=initPeepal;
window.initPeepal=async function(){
  await _origInitPeepal();
  setTimeout(animateDiscoveryCards,300);
};


