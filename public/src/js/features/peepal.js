// ===================== ONBOARDING =====================
let onboardingDone=JSON.parse(localStorage.getItem('chaupaal_onboarded')||'false');

function showOnboarding(){
  if(onboardingDone)return;
  const overlay=document.createElement('div');overlay.className='onboarding-overlay';overlay.id='onboardingOverlay';
  let step=0;const selectedCategories=[];let aurSunaoAnswer=null;
  const steps=[
    {title:"What are you into? 👋",sub:"Pick 2 or more topics — we'll personalise your Akhbaar from day one.",type:'categories'},
    {title:"Quick one 🎭",sub:"No right answer — just helps us understand you.",type:'aur_sunao',q:"Pick your ideal Sunday:",opts:["🏔️ Trek in the mountains","📚 Read a good book","🎬 Movie marathon","🍳 Try a new recipe"]},
    {title:"Let's try one Akhbaar question! 📰",sub:"Experience how Chaupaal works before you sign up.",type:'sample_q'},
  ];
  function renderStep(){
    const s=steps[step];
    overlay.innerHTML=`
      <div class="onboarding-progress">${steps.map((_,i)=>`<div class="onboarding-prog-seg ${i<=step?'fill':''}"></div>`).join('')}</div>
      <div class="onboarding-body">
        <div class="onboarding-title">${s.title}</div>
        <div class="onboarding-sub">${s.sub}</div>
        ${s.type==='categories'?`
          <div class="onboarding-chips" id="onboardChips">
            ${CATEGORY_SUGGESTIONS.slice(0,12).map(c=>`<button class="onboarding-chip" data-name="${c.name}">${c.emoji} ${c.name}</button>`).join('')}
          </div>
        `:s.type==='aur_sunao'?`
          <div class="onboarding-chips">
            ${s.opts.map((o,i)=>`<button class="onboarding-chip" data-i="${i}">${o}</button>`).join('')}
          </div>
        `:s.type==='sample_q'?`
          <div style="background:var(--white);border-radius:20px;padding:20px;flex:1;">
            <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">GK</div>
            <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:16px;">${SAMPLE_QUESTIONS[0].q}</div>
            <div style="display:flex;flex-direction:column;gap:8px;" id="sampleOpts">
              ${SAMPLE_QUESTIONS[0].options.map((o,i)=>`<button class="opt" data-i="${i}"><span>${o}</span><span class="mark"></span></button>`).join('')}
            </div>
          </div>
        `:''}
        <button class="btn btn--primary btn--block btn--lg onboarding-next-btn" id="onboardNext" style="${s.type==='sample_q'?'display:none;':''}">${step===steps.length-1?"Let's go! 🚀":"Continue →"}</button>
        <button class="onboarding-skip" id="onboardSkip">Skip</button>
      </div>
    `;
    // Category chips
    if(s.type==='categories'){
      overlay.querySelectorAll('.onboarding-chip').forEach(chip=>{
        chip.addEventListener('click',()=>{
          chip.classList.toggle('selected');
          const name=chip.dataset.name;
          const idx=selectedCategories.indexOf(name);
          if(idx>-1) selectedCategories.splice(idx,1);
          else selectedCategories.push(name);
          const next=document.getElementById('onboardNext');
          if(next){
            next.disabled=selectedCategories.length<2;
            next.style.opacity=selectedCategories.length<2?'0.45':'1';
          }
        });
      });
      const nextInit=document.getElementById('onboardNext');
      if(nextInit){
        nextInit.disabled=selectedCategories.length<2;
        nextInit.style.opacity=selectedCategories.length<2?'0.45':'1';
      }
    }
    // Aur Sunao chips
    if(s.type==='aur_sunao'){
      overlay.querySelectorAll('.onboarding-chip').forEach(chip=>{
        chip.addEventListener('click',()=>{overlay.querySelectorAll('.onboarding-chip').forEach(c=>c.classList.remove('selected'));chip.classList.add('selected');aurSunaoAnswer=s.opts[parseInt(chip.dataset.i)];});
      });
    }
    // Sample question
    if(s.type==='sample_q'){
      const sOpts=overlay.querySelectorAll('#sampleOpts .opt');
      const nextBtn=document.getElementById('onboardNext');
      nextBtn.style.display='none'; // hide until answered
      sOpts.forEach(btn=>btn.addEventListener('click',()=>{
        const chosen=parseInt(btn.dataset.i);const correct=SAMPLE_QUESTIONS[0].correct;
        sOpts.forEach(b=>b.disabled=true);
        sOpts.forEach((b,i)=>{
          if(i===correct){b.classList.add('correct');b.querySelector('.mark').textContent='✓';}
          else if(i===chosen&&chosen!==correct){b.classList.add('wrong');b.querySelector('.mark').textContent='✕';}
          else b.classList.add('dim');
        });
        SoundLib.playFeedback(chosen===correct,'default');
        // Show continue after short delay
        setTimeout(()=>{
          nextBtn.style.display='block';
          nextBtn.textContent="Let's go! 🚀";
          nextBtn.scrollIntoView({behavior:'smooth',block:'nearest'});
        },600);
      }));
    }
    document.getElementById('onboardNext').addEventListener('click',()=>{
      if(s.type==='categories'){
        if(selectedCategories.length<2){
          if(typeof showToast==='function') showToast('Pick at least 2 topics to continue');
          return;
        }
        selectedCategories.forEach(name=>addCategory(name,getCategoryEmoji(name)));
      }
      if(s.type==='aur_sunao'&&aurSunaoAnswer){updatePersonalityFromAurSunao(s.q,aurSunaoAnswer);}
      step++;
      if(step>=steps.length){finishOnboarding(overlay);}else renderStep();
    });
    document.getElementById('onboardSkip').addEventListener('click',()=>finishOnboarding(overlay));
  }
  document.querySelector('.device').appendChild(overlay);renderStep();
}

function finishOnboarding(overlay){
  onboardingDone=true;try{localStorage.setItem('chaupaal_onboarded','true');}catch(e){}
  overlay.style.opacity='0';overlay.style.transition='opacity .4s ease';setTimeout(()=>overlay.remove(),400);
  // Soft banner only — never force auth overlay after guest onboarding.
  if(typeof currentUser==='undefined'||!currentUser){
    if(typeof showGuestSignInBanner==='function') showGuestSignInBanner();
  }
  if(typeof maybeOfferFirstRunCoach==='function'){
    maybeOfferFirstRunCoach({ delayMs: 700 });
  }
}

function showComingSoonModal(kind){
  if(typeof openLegalSheet==='function'){
    openLegalSheet(kind==='privacy'?'privacy':'terms');
    return;
  }
  const title=kind==='privacy'?'Privacy Policy':'Terms of Service';
  const existing=document.getElementById('comingSoonModal');
  if(existing) existing.remove();
  const backdrop=document.createElement('div');
  backdrop.id='comingSoonModal';
  backdrop.className='modal-backdrop';
  backdrop.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="comingSoonTitle">
      <div class="modal-header">
        <div class="modal-title" id="comingSoonTitle">${title}</div>
        <button type="button" class="icon-btn" data-dismiss="coming-soon" aria-label="Close">✕</button>
      </div>
      <p class="modal-sub">Legal text is temporarily unavailable. Please try again later.</p>
      <button type="button" class="btn btn--primary btn--block modal-btn" data-dismiss="coming-soon">Got it</button>
    </div>`;
  document.querySelector('.device')?.appendChild(backdrop);
  const close=()=>backdrop.remove();
  backdrop.addEventListener('click',(e)=>{ if(e.target===backdrop) close(); });
  backdrop.querySelectorAll('[data-dismiss="coming-soon"]').forEach(btn=>btn.addEventListener('click',close));
  if(typeof pushNavLayer==='function'){
    backdrop.dataset.navManaged='1';
    pushNavLayer(backdrop,close);
  }
}

function showGuestSignInBanner(){
  if(typeof currentUser!=='undefined'&&currentUser) return;
  let bar=document.getElementById('guestSignInBanner');
  if(bar){ bar.classList.remove('hidden'); return; }
  bar=document.createElement('div');
  bar.id='guestSignInBanner';
  bar.className='guest-signin-banner';
  bar.innerHTML=`
    <div class="guest-signin-copy"><strong>Sign in to save progress</strong><span>Keep streaks, chats, and categories across devices.</span></div>
    <div class="guest-signin-actions">
      <button type="button" class="btn btn--primary" data-guest-auth="signup">Create account</button>
      <button type="button" class="btn btn--secondary" data-guest-auth="login">Log in</button>
      <button type="button" class="guest-signin-dismiss" aria-label="Dismiss">✕</button>
    </div>`;
  const device=document.querySelector('.device')||document.body;
  device.appendChild(bar);
  bar.querySelector('[data-guest-auth="signup"]')?.addEventListener('click',()=>{
    if(typeof showAuth==='function') showAuth();
    setTimeout(()=>document.getElementById('heroSignupBtn')?.click(),80);
  });
  bar.querySelector('[data-guest-auth="login"]')?.addEventListener('click',()=>{
    if(typeof showAuth==='function') showAuth();
    setTimeout(()=>document.getElementById('heroLoginBtn')?.click(),80);
  });
  bar.querySelector('.guest-signin-dismiss')?.addEventListener('click',()=>bar.classList.add('hidden'));
}

function hideGuestSignInBanner(){
  document.getElementById('guestSignInBanner')?.classList.add('hidden');
}

window.showComingSoonModal=showComingSoonModal;
window.showGuestSignInBanner=showGuestSignInBanner;
window.hideGuestSignInBanner=hideGuestSignInBanner;

document.addEventListener('click',(e)=>{
  const link=e.target.closest?.('.auth-legal-link,[data-legal]');
  if(!link) return;
  e.preventDefault();
  const kind=link.getAttribute('data-legal')||'terms';
  if(typeof openLegalSheet==='function') openLegalSheet(kind);
  else showComingSoonModal(kind);
});
